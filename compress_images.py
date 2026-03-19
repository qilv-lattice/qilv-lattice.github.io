import os
import re
from PIL import Image

def compress_images():
    assets_dir = 'assets'
    extensions = ('.jpg', '.jpeg', '.png')
    
    # 1. 转换图片
    converted_files = {}
    for filename in os.listdir(assets_dir):
        if filename.lower().endswith(extensions):
            input_path = os.path.join(assets_dir, filename)
            base_name = os.path.splitext(filename)[0]
            output_path = os.path.join(assets_dir, f"{base_name}.webp")
            
            try:
                with Image.open(input_path) as img:
                    img.save(output_path, 'WEBP', quality=80)
                
                original_size = os.path.getsize(input_path)
                new_size = os.path.getsize(output_path)
                reduction = (original_size - new_size) / original_size * 100
                print(f"Compressed {filename}: {original_size/1024:.1f}KB -> {new_size/1024:.1f}KB ({reduction:.1f}% saved)")
                
                converted_files[filename] = f"{base_name}.webp"
            except Exception as e:
                print(f"Failed to compress {filename}: {e}")

    # 2. 更新 HTML 和 CSS
    files_to_update = ['index.html']
    # 同时也检查 css 目录下的文件
    css_dir = 'css'
    if os.path.exists(css_dir):
        for f in os.listdir(css_dir):
            if f.endswith('.css'):
                files_to_update.append(os.path.join(css_dir, f))

    for file_path in files_to_update:
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            updated_content = content
            for old_name, new_name in converted_files.items():
                # 精确匹配文件名
                updated_content = updated_content.replace(f'assets/{old_name}', f'assets/{new_name}')
                # 也尝试匹配不带目录的
                updated_content = updated_content.replace(old_name, new_name)
            
            if updated_content != content:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(updated_content)
                print(f"Updated references in {file_path}")

if __name__ == "__main__":
    compress_images()
