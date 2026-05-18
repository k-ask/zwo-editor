import os
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, 'standalone')

APPS = [
    {
        'name': 'zwo_editor_desktop.html',
        'dir': 'desktop_app',
        'is_pwa': False
    },
    {
        'name': 'zwo_editor_mobile.html',
        'dir': 'mobile_pwa',
        'is_pwa': True
    }
]

def inline_css(content, base_dir):
    def replacer(match):
        css_file = match.group(1).split('?')[0] # remove query params like ?v=1.3
        filepath = os.path.join(base_dir, css_file)
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return f"<style>\n{f.read()}\n</style>"
        return match.group(0) # fallback
    
    # Matches <link rel="stylesheet" href="filename.css">
    return re.sub(r'<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>', replacer, content)

def inline_js(content, base_dir):
    def replacer(match):
        src = match.group(1)
        if src.startswith('http'):
            return match.group(0) # ignore CDNs
        
        js_file = src.split('?')[0]
        filepath = os.path.join(base_dir, js_file)
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return f"<script>\n{f.read()}\n</script>"
        return match.group(0)

    # Matches <script src="filename.js" ...></script> or <script ... src="filename.js"></script>
    # Note: re.sub won't easily handle attributes before/after src robustly if there are multiple without a proper parser,
    # but our tags are simple: <script src="workouts.js?t=123"></script> and <script src="editor.js" defer></script>
    
    # We'll use a simpler regex specific to our format
    pattern = r'<script\s+src="([^"]+)"[^>]*></script>'
    return re.sub(pattern, replacer, content)

def strip_pwa(content):
    # Remove manifest link
    content = re.sub(r'<link\s+rel="manifest"\s+href="[^"]+">\n?', '', content)
    # Remove service worker script block
    # This regex looks for the script block containing 'serviceWorker'
    content = re.sub(r'<script>\s*if\s*\(\'serviceWorker\'.*?</script>\n?', '', content, flags=re.DOTALL)
    return content

def build_standalone():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        
    for app in APPS:
        app_dir = os.path.join(BASE_DIR, app['dir'])
        index_path = os.path.join(app_dir, 'index.html')
        if not os.path.exists(index_path):
            print(f"Warning: {index_path} not found.")
            continue
            
        with open(index_path, 'r', encoding='utf-8') as f:
            html = f.read()
            
        print(f"Building {app['name']}...")
        
        # 1. Inline CSS
        html = inline_css(html, app_dir)
        
        # 2. Inline JS
        html = inline_js(html, app_dir)
        
        # 3. Strip PWA features if needed
        if app['is_pwa']:
            html = strip_pwa(html)
            
        out_path = os.path.join(OUTPUT_DIR, app['name'])
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(html)
            
        print(f"  -> Saved to {out_path} ({os.path.getsize(out_path) // 1024} KB)")

if __name__ == "__main__":
    build_standalone()
