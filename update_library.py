import os
import json
import xml.etree.ElementTree as ET

WORKOUTS_DIR = 'workouts'
OUTPUT_FILES = [
    'mobile_pwa/workouts.js',
    'desktop_app/workouts.js'
]

def parse_zwo(filepath):
    tree = ET.parse(filepath)
    root = tree.getroot()
    
    workout_id = os.path.splitext(os.path.basename(filepath))[0]
    
    def get_text(tag, default=''):
        el = root.find(tag)
        return el.text if el is not None and el.text else default
        
    name = get_text('name', workout_id)
    description = get_text('description', '')
    
    workout_data = {
        'id': workout_id,
        'name': name,
        'description': description,
        'segments': []
    }
    
    workout_node = root.find('workout')
    if workout_node is not None:
        for child in workout_node:
            tag = child.tag
            def get_attr(attr_name): return child.attrib.get(attr_name)
            def parse_float(val): return float(val) if val else 0.0
            def parse_int(val): return int(val) if val else 0
            
            segment = {
                'type': tag,
                'duration': parse_int(get_attr('Duration'))
            }
            if tag in ['Warmup', 'CoolDown', 'Ramp']:
                segment['power_low'] = parse_float(get_attr('PowerLow'))
                segment['power_high'] = parse_float(get_attr('PowerHigh'))
            elif tag == 'SteadyState':
                segment['power'] = parse_float(get_attr('Power'))
            elif tag == 'IntervalsT':
                segment['repeat'] = parse_int(get_attr('Repeat'))
                segment['on_duration'] = parse_int(get_attr('OnDuration'))
                segment['off_duration'] = parse_int(get_attr('OffDuration'))
                segment['on_power'] = parse_float(get_attr('OnPower'))
                segment['off_power'] = parse_float(get_attr('OffPower'))
            elif tag == 'FreeRide' or tag == 'MaxEffort':
                pass # duration is already set
                
            workout_data['segments'].append(segment)
            
    return workout_data

def build_library():
    print("Scannings workouts folder...")
    if not os.path.exists(WORKOUTS_DIR):
        os.makedirs(WORKOUTS_DIR)
        print(f"Created {WORKOUTS_DIR} folder. Add your .zwo or .json files here.")
        return

    workouts = []
    
    for filename in sorted(os.listdir(WORKOUTS_DIR)):
        filepath = os.path.join(WORKOUTS_DIR, filename)
        if filename.endswith('.zwo'):
            try:
                data = parse_zwo(filepath)
                workouts.append(data)
                print(f"  Parsed {filename}")
            except Exception as e:
                print(f"  Error parsing {filename}: {e}")
        elif filename.endswith('.json'):
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    workouts.append(data)
                print(f"  Parsed {filename}")
            except Exception as e:
                print(f"  Error parsing {filename}: {e}")
                
    js_content = "// ユーザー定義ワークアウトリスト\n"
    js_content += "// 自動生成されたファイルです。手動で編集しないでください。\n"
    js_content += "// workouts/ フォルダ内のファイルを編集し、update_library.py を実行してください。\n\n"
    js_content += "const STATIC_WORKOUTS = " + json.dumps(workouts, indent=4, ensure_ascii=False) + ";\n"
    
    for out_file in OUTPUT_FILES:
        try:
            with open(out_file, 'w', encoding='utf-8') as f:
                f.write(js_content)
            print(f"Updated {out_file}")
        except Exception as e:
            print(f"Failed to write to {out_file}: {e}")

    # Update HTML files with cache-busting timestamp
    import time
    import re
    timestamp = int(time.time())
    HTML_FILES = ['mobile_pwa/index.html', 'desktop_app/index.html']
    
    for html_file in HTML_FILES:
        try:
            with open(html_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Replace workouts.js or workouts.js?t=123 with workouts.js?t=new_timestamp
            new_content = re.sub(r'workouts\.js(\?t=\d+)?', f'workouts.js?t={timestamp}', content)
            
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated cache-busting timestamp in {html_file}")
        except Exception as e:
            print(f"Failed to update {html_file}: {e}")

    # Auto-bump Service Worker cache version
    SW_FILE = 'mobile_pwa/sw.js'
    try:
        with open(SW_FILE, 'r', encoding='utf-8') as f:
            sw_content = f.read()
            
        # Replace const CACHE_NAME = 'zwo-editor-vX.Y.Z'; or similar with a timestamped version
        # to guarantee the Service Worker updates and clears old cache.
        sw_content = re.sub(r"const CACHE_NAME = 'zwo-editor([^']*)';", f"const CACHE_NAME = 'zwo-editor-v1.4-{timestamp}';", sw_content)
        
        with open(SW_FILE, 'w', encoding='utf-8') as f:
            f.write(sw_content)
        print(f"Updated cache version in {SW_FILE} to force PWA refresh")
    except Exception as e:
        print(f"Failed to update {SW_FILE}: {e}")

if __name__ == "__main__":
    build_library()
