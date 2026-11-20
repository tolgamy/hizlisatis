"""Convert the owner's private 19,096-row Excel to compact catalog JSON.

Run locally with `python scripts/import-private-excel.py path.xlsx /tmp/rows.json`.
Source workbook is deliberately never copied to public/ or GitHub.
The XML-sheet reader is stdlib-only because artifact_tool can't open this 19k-row workbook
in constrained environments; does not modify the Excel file.
"""
import collections, json, re, sys, zipfile, xml.etree.ElementTree as ET
from pathlib import Path

SOURCE=Path(sys.argv[1]);OUT=Path(sys.argv[2]);NS='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

def cell_value(c):
    inline = c.find(NS+'is')
    if inline is not None:
        return ''.join(inline.itertext()).strip()
    return (c.findtext(NS+'v') or '').strip()

def read_sheet(z, name):
    with z.open(name) as fh:
        for ev,el in ET.iterparse(fh,events=('end',)):
            if el.tag == NS+'row':
                values={re.match(r'[A-Z]+',c.attrib.get('r','')).group():cell_value(c)
                        for c in el.findall(NS+'c') if re.match(r'[A-Z]+',c.attrib.get('r',''))}
                yield values
                el.clear()

with zipfile.ZipFile(SOURCE) as z:
    tree=list(read_sheet(z,'xl/worksheets/sheet3.xml'))
    taxonomy=collections.defaultdict(set)
    for row in tree[1:]: taxonomy[row.get('A','')].add(row.get('B',''))
    assert len(taxonomy)==12,(len(taxonomy),list(taxonomy))
    assert sum(map(len,taxonomy.values()))==86
    names={(main,sub) for main,subs in taxonomy.items() for sub in subs}
    counts=collections.Counter();missing_brand=0;invalid=[];barcodes=set();rows=[];sources=collections.Counter()
    for lineno,row in enumerate(read_sheet(z,'xl/worksheets/sheet1.xml')):
        if lineno==0:continue
        barcode=row.get('A','');sku=row.get('B','');title=row.get('C','').strip();brand=row.get('F','').strip()
        main=row.get('N','').strip();sub=row.get('G','').strip()
        price=row.get('I','');stock=row.get('J',''); image=row.get('L','').strip()
        if (main,sub) not in names: invalid.append((lineno+1,main,sub))
        if barcode in barcodes or not barcode: raise ValueError(f'Barkod eksik veya tekrar ediyor: {lineno+1} {barcode}')
        barcodes.add(barcode)
        if not brand:missing_brand+=1
        if not title:raise ValueError(f'Ürün adı eksik: {lineno+1}')
        if not price:raise ValueError(f'Fiyat eksik: {lineno+1}')
        parsed_price=float(price.replace(',','.'))
        if parsed_price<0:raise ValueError(f'Negatif fiyat: {lineno+1}')
        parsed_stock=int(float(stock)) if stock else None
        if parsed_stock is not None and parsed_stock<0:raise ValueError(f'Negatif stok: {lineno+1}')
        rows.append([barcode,sku,title,brand,main+' > '+sub,parsed_price,parsed_stock,image,row.get('H','TRY') or 'TRY'])
        counts[main]+=1;sources[row.get('M','')]+=1
    if len(rows)!=19096:raise ValueError(f'19.096 yerine {len(rows)} kayıt bulundu')
    if invalid:raise ValueError(f'Kategoride {len(invalid)} uygunsuz değer var. Örnek: {invalid[:4]}')
    # Infer only from verified brands already in this workbook.  Never guess a new brand.
    brand_counts=collections.Counter(r[3] for r in rows if r[3])
    known=sorted((b for b,c in brand_counts.items() if c>=2 and len(b)>=3),key=len,reverse=True)
    inferred=0
    for r in rows:
        if r[3]:continue
        title=r[2].casefold()
        for brand in known:
            start=brand.casefold()
            if title.startswith(start) and (len(title)==len(start) or not title[len(start)].isalnum()):
                r[3]=brand
                inferred+=1
                break
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print(json.dumps({'count':len(rows),'mainCategories':len(taxonomy),'subCategories':len(names),'withImages':sum(bool(r[7]) for r in rows),'withoutImages':sum(not r[7] for r in rows),'withoutBrandOriginal':missing_brand,'inferredBrand':inferred,'withoutBrandAfter':missing_brand-inferred,'withoutStock':sum(r[6] is None for r in rows),'sources':sources,'categoryCounts':counts,'output':str(OUT)},ensure_ascii=False,indent=2))
