#!/usr/bin/env python3
"""
update-poem.py — 七律空间诗词内容更新工具

用法:
    python update-poem.py            # 交互模式
    python update-poem.py 回望       # 直接指定诗题（模糊匹配）
"""

import json
import os
import base64
import sys
import subprocess
from datetime import datetime

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

POEMS_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'poems.json')
SALT = bytes([113, 105, 108, 118, 45, 108, 97, 116, 116, 105, 99, 101, 45, 107, 100, 102])
ITERATIONS = 250000


# ── 加密/解密 ────────────────────────────────────────────

def derive_key(pwd: str) -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=SALT, iterations=ITERATIONS)
    return kdf.derive(pwd.encode('utf-8'))


def encrypt_payload(obj: dict, key: bytes) -> str:
    iv = os.urandom(12)
    plaintext = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    ct = AESGCM(key).encrypt(iv, plaintext.encode('utf-8'), None)
    return base64.b64encode(iv + ct).decode()


def decrypt_payload(b64: str, key: bytes) -> dict:
    raw = base64.b64decode(b64)
    decrypted = AESGCM(key).decrypt(raw[:12], raw[12:], None)
    result = json.loads(decrypted.decode('utf-8'))
    # 兼容旧格式（直接加密数组）
    if isinstance(result, list):
        return {'content': result, 'notes': []}
    return result


# ── 输入帮助 ─────────────────────────────────────────────

def input_lines(hint: str) -> list[str] | None:
    """
    逐行输入，空行结束。
    第一行直接回车 → 返回 None（表示"保留原值"）
    """
    print(hint)
    lines = []
    first = input('  > ')
    if first == '':
        return None
    lines.append(first)
    while True:
        line = input('  > ')
        if line == '':
            break
        lines.append(line)
    return lines


# ── 主流程 ───────────────────────────────────────────────

def main():
    with open(POEMS_JSON, encoding='utf-8') as f:
        data = json.load(f)

    poems = data['poems']

    # 确定诗题
    title_input = (' '.join(sys.argv[1:])).strip() if len(sys.argv) > 1 else input('诗题（模糊匹配）: ').strip()
    if not title_input:
        print('未输入诗题，退出。')
        sys.exit(0)

    matches = [p for p in poems if title_input in p['title']]
    if not matches:
        print(f'未找到包含「{title_input}」的诗词。')
        sys.exit(1)
    if len(matches) > 1:
        print('匹配到多首，请选择:')
        for i, p in enumerate(matches):
            print(f'  {i + 1}. {p["title"]}')
        idx = int(input('序号: ').strip()) - 1
        poem = matches[idx]
    else:
        poem = matches[0]

    print(f'\n【{poem["title"]}】\n')

    # 解密当前内容
    pwd = input('网站密码: ').strip()
    key = derive_key(pwd)

    current_content, current_notes = [], []
    if poem.get('encryptedContent'):
        try:
            payload = decrypt_payload(poem['encryptedContent'], key)
            current_content = payload.get('content', [])
            current_notes = payload.get('notes', [])
        except Exception:
            print('⚠ 密码错误或解密失败，将以空内容开始编辑。')

    print('当前内容:')
    for i, line in enumerate(current_content, 1):
        print(f'  {i}. {line}')
    if current_notes:
        print('当前注释:')
        for note in current_notes:
            print(f'  · {note}')

    # 输入新内容
    new_content = input_lines('\n新内容（每行回车，空行结束；直接回车保留原内容）:')
    if new_content is None:
        new_content = current_content
        print('  （保留原内容）')

    # 输入新注释
    new_notes = input_lines('\n新注释（每行回车，空行结束；直接回车保留；输入"-"清空）:')
    if new_notes is None:
        new_notes = current_notes
        print('  （保留原注释）')
    elif new_notes == ['-']:
        new_notes = []
        print('  （已清空注释）')

    # 加密写回
    encrypted = encrypt_payload({'content': new_content, 'notes': new_notes}, key)
    poem['encryptedContent'] = encrypted
    poem['content'] = new_content  # 明文备份

    # 更新 modifiedWorks
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M')
    display_title = f'《{poem["title"]}》'
    modified = data.setdefault('modifiedWorks', [])
    entry = next((m for m in modified if m['title'] == display_title), None)
    if entry:
        entry['modifiedAt'] = now_str
    else:
        modified.insert(0, {'title': display_title, 'modifiedAt': now_str})

    with open(POEMS_JSON, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

    print(f'\n✓ 已更新「{poem["title"]}」')

    # 推送
    push = input('\n推送到 GitHub？(y/n): ').strip().lower()
    if push == 'y':
        subprocess.run(['git', 'add', 'data/poems.json'], check=True, cwd=os.path.dirname(POEMS_JSON))
        subprocess.run(
            ['git', 'commit', '-m', f'feat: 更新《{poem["title"]}》'],
            check=True, cwd=os.path.dirname(POEMS_JSON)
        )
        subprocess.run(['git', 'push'], check=True, cwd=os.path.dirname(POEMS_JSON))
        print('✓ 推送完成')
    else:
        print('未推送，可稍后手动 git push。')


if __name__ == '__main__':
    main()
