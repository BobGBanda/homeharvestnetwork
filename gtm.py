import re, os

HEAD = '<!-- Google Tag Manager --><script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({"gtm.start":new Date().getTime(),event:"gtm.js"});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!="dataLayer"?"&l="+l:"";j.async=true;j.src="https://www.googletagmanager.com/gtm.js?id="+i+dl;f.parentNode.insertBefore(j,f);})(window,document,"script","dataLayer","GTM-5M2VQ3QX");</script><!-- End Google Tag Manager -->'

BODY = '<!-- Google Tag Manager (noscript) --><noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-5M2VQ3QX" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript><!-- End Google Tag Manager (noscript) -->'

files = ["index.html","about.html","contact.html","for-business.html","for-growers.html","subscriptions.html"]

for f in files:
    if not os.path.exists(f):
        print("MISSING: " + f)
        continue
    with open(f, 'r', encoding='utf-8') as fh:
        content = fh.read()
    if 'GTM-5M2VQ3QX' in content:
        print("SKIP (already done): " + f)
        continue
    content = re.sub(r'(<head[^>]*>)', r'\1\n' + HEAD, content, count=1, flags=re.IGNORECASE)
    content = re.sub(r'(<body[^>]*>)', r'\1\n' + BODY, content, count=1, flags=re.IGNORECASE)
    with open(f, 'w', encoding='utf-8') as fh:
        fh.write(content)
    print("UPDATED: " + f)

print("Done.")
