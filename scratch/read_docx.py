import zipfile
import re
import xml.etree.ElementTree as ET

def extract_text_from_docx(docx_path):
    # docx is a zip file, we can open it and read word/document.xml
    try:
        with zipfile.ZipFile(docx_path) as z:
            xml_content = z.read('word/document.xml')
            
            # Use ElementTree to parse XML
            root = ET.fromstring(xml_content)
            
            # The namespaces
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            
            # Find all paragraph elements and extract text from text runs
            paragraphs = []
            for paragraph in root.findall('.//w:p', ns):
                texts = [node.text for node in paragraph.findall('.//w:t', ns) if node.text]
                if texts:
                    paragraphs.append("".join(texts))
            
            return "\n".join(paragraphs)
    except Exception as e:
        return f"Error reading docx: {str(e)}"

if __name__ == "__main__":
    docx_path = r"c:\Users\ELECTRO-TECH\OneDrive\Desktop\SMS\Graviton_Dual_Template_Plan.docx"
    text = extract_text_from_docx(docx_path)
    output_path = r"c:\Users\ELECTRO-TECH\OneDrive\Desktop\SMS\scratch\dual_template_plan.txt"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"Extracted plan text written to {output_path}")
