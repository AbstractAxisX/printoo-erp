import json, re, sys

def clean(html):
    html = re.sub(r'<script[^>]*>.*?</script>', ' ', html, flags=re.S|re.I)
    html = re.sub(r'<style[^>]*>.*?</style>', ' ', html, flags=re.S|re.I)
    html = re.sub(r'<!--.*?-->', ' ', html, flags=re.S)
    text = re.sub(r'<[^>]+>', '\n', html)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n\s*\n+', '\n', text)
    return text.strip()

f = sys.argv[1]
d = json.load(open(f))
data = d.get('data', d) if isinstance(d, dict) else d
print(f"TITLE: {data.get('title','')}")
print(f"URL: {data.get('url','')}")
print("=" * 60)
print(clean(data.get('html',''))[:8000])
