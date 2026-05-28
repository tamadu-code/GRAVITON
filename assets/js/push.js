/**
 * Graviton CMS - Push Notification Manager
 * Handles client-side Web Push API subscription and permission flow.
 */

import { getSupabase } from './supabase-client.js';
import { Notifications } from './utils.js';

// Helper to convert VAPID public key
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * Initialize Push Notification permissions and subscription
 * @param {string} userId - Current logged in user ID (profile ID)
 * @param {string} [customVapidKey] - Optional VAPID key. If not provided, it looks in localStorage
 */
export async function initPushNotifications(userId, customVapidKey = null) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('[Push] Push notifications not supported on this browser/device.');
        return { success: false, error: 'Unsupported browser' };
    }

    const vapidKey = customVapidKey || localStorage.getItem('vapid_public_key');
    if (!vapidKey) {
        console.log('[Push] No VAPID public key configured. Push initialization deferred until key is set.');
        return { success: false, error: 'No VAPID key' };
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        
        // Check current permission state
        const permission = Notification.permission;
        if (permission === 'denied') {
            console.warn('[Push] Notification permission previously denied by user.');
            return { success: false, error: 'Permission denied' };
        }

        // If default (not asked yet), request permission
        if (permission === 'default') {
            const requested = await Notification.requestPermission();
            if (requested !== 'granted') {
                console.log('[Push] Notification permission denied by user.');
                return { success: false, error: 'Permission denied' };
            }
        }

        // Subscribe or update subscription
        return await subscribeUser(registration, userId, vapidKey);
    } catch (err) {
        console.error('[Push] Initialization failed:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Subscribe user to Push service
 */
async function subscribeUser(registration, userId, vapidKey) {
    try {
        const subscribeOptions = {
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey)
        };

        const subscription = await registration.pushManager.subscribe(subscribeOptions);
        console.log('[Push] Browser subscription created:', subscription);

        // Send to Supabase
        const success = await saveSubscriptionToCloud(userId, subscription);
        if (success) {
            console.log('[Push] Subscription successfully registered on server.');
            return { success: true, subscription };
        } else {
            return { success: false, error: 'Cloud register failed' };
        }
    } catch (err) {
        console.error('[Push] Failed to subscribe user:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Save subscription endpoint and keys to Supabase database
 */
async function saveSubscriptionToCloud(userId, subscription) {
    const client = getSupabase();
    if (!client) return false;

    try {
        const subData = subscription.toJSON();
        const endpoint = subData.endpoint;
        const p256dh = subData.keys?.p256dh;
        const auth = subData.keys?.auth;

        if (!endpoint || !p256dh || !auth) {
            console.error('[Push] Invalid subscription keys.');
            return false;
        }

        // Store subscription in public.push_subscriptions table
        // We upsert by endpoint to prevent duplicate entries for the same device
        const { error } = await client.from('push_subscriptions').upsert({
            user_id: String(userId),
            endpoint: endpoint,
            p256dh: p256dh,
            auth: auth,
            updated_at: new Date().toISOString()
        }, { onConflict: 'endpoint' });

        if (error) {
            console.error('[Push] Supabase upsert error:', error.message);
            return false;
        }
        return true;
    } catch (e) {
        console.error('[Push] Failed to save subscription:', e);
        return false;
    }
}

/**
 * Unsubscribe user from Push service
 */
export async function unsubscribeUser() {
    if (!('serviceWorker' in navigator)) return false;

    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        
        if (subscription) {
            const endpoint = subscription.endpoint;
            
            // Delete from browser
            await subscription.unsubscribe();
            console.log('[Push] Browser subscription removed.');

            // Delete from Supabase
            const client = getSupabase();
            if (client) {
                await client.from('push_subscriptions').delete().eq('endpoint', endpoint);
                console.log('[Push] Cloud subscription removed.');
            }
            return true;
        }
    } catch (err) {
        console.error('[Push] Unsubscribe error:', err);
    }
    return false;
}
