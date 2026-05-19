const normalize = (t) => String(t || '').toLowerCase().replace(/\s+/g, '').replace('1st', 'first').replace('2nd', 'second').replace('3rd', 'third');

const testCases = [
    { db: '2nd Term', filter: '1st Term' },
    { db: '1st Term', filter: '2nd Term' },
    { db: '2nd', filter: '1st' },
    { db: 'Second Term', filter: '1st Term' },
    { db: '2nd Term', filter: 'Term' },
    { db: 'Term 2', filter: '1st Term' },
    { db: '2nd Term', filter: '2nd Term' },
];

for (const tc of testCases) {
    const dbNorm = normalize(tc.db);
    const filterNorm = normalize(tc.filter);
    const termMatch = dbNorm === filterNorm || dbNorm.includes(filterNorm) || filterNorm.includes(dbNorm);
    console.log(`db: "${tc.db}" | filter: "${tc.filter}" -> Match: ${termMatch} (dbNorm: "${dbNorm}", filterNorm: "${filterNorm}")`);
}
