import os
import re
import urllib.request
import ssl

ssl._create_default_https_context = ssl._create_unverified_context

# 目标：仅下载 LXGW WenKai Screen (标准版)
# 之前的 style.css 导入了多个版本，我们直接定位到需要的那个
BASE_URL = "https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-web/lxgwwenkaiscreen"
CSS_URL = f"{BASE_URL}/result.css"
LOCAL_CSS_PATH = "css/fonts.css"
LOCAL_FONT_DIR = "assets/fonts"

def download_file(url, path):
    print(f"Downloading {url} to {path}...")
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        )
        with urllib.request.urlopen(req) as response, open(path, 'wb') as out_file:
            data = response.read()
            out_file.write(data)
            return data.decode('utf-8') if path.endswith('.css') else None
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        return None

def main():
    if not os.path.exists(LOCAL_FONT_DIR):
        os.makedirs(LOCAL_FONT_DIR)
        print(f"Created directory: {LOCAL_FONT_DIR}")

    # 1. 下载 CSS
    css_content = download_file(CSS_URL, LOCAL_CSS_PATH)
    if not css_content:
        return

    # 2. 解析字体 URL (通常是 .woff2)
    # 匹配 url('...') 并提取
    pattern = re.compile(r"url\(['\"]?([^'\")]+)['\"]?\)")
    new_css_content = css_content
    
    for match in pattern.finditer(css_content):
        font_url = match.group(1)
        filename = font_url.split('/')[-1]
        
        # 排除非字体文件 (虽然这里应该都是字体)
        if not (filename.endswith('.woff2') or filename.endswith('.woff') or filename.endswith('.ttf')):
            continue

        # 构建完整下载链接
        # 字体通常在 CSS 同级目录
        if not font_url.startswith('http'):
            download_url = f"{BASE_URL}/{font_url}"
        else:
            download_url = font_url
            
        local_font_path = os.path.join(LOCAL_FONT_DIR, filename)
        
        # 3. 下载字体
        if not os.path.exists(local_font_path):
            download_file(download_url, local_font_path)
        else:
            print(f"Font {filename} already exists, skipping.")
            
        # 4. 替换 CSS 中的路径
        # css/fonts.css 引用 ../assets/fonts/xxx
        new_path = f"../assets/fonts/{filename}"
        new_css_content = new_css_content.replace(font_url, new_path)

    # 5. 保存修改后的 CSS
    with open(LOCAL_CSS_PATH, 'w', encoding='utf-8') as f:
        f.write(new_css_content)
    print(f"Saved local CSS to {LOCAL_CSS_PATH}")
    print("Done!")

if __name__ == "__main__":
    main()
