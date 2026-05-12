# 七律空间 · 项目说明

## 项目性质

个人古典诗词网站，静态部署在 GitHub Pages + Cloudflare。主分支 `feature/three-card`，直接推送即上线。

## 核心文件

- `data/poems.json` — 所有诗词数据，加密存储
- `js/script.js` — 前端逻辑，含解密渲染
- `index.html` — 主页
- `update-poem.py` — 交互式诗词更新工具（推荐用临时脚本替代，更可控）

## 加密方案

所有诗词内容用 AES-GCM 加密，密钥由 PBKDF2 派生：

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

SALT = bytes([113,105,108,118,45,108,97,116,116,105,99,101,45,107,100,102])
kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=SALT, iterations=250000)
key = kdf.derive(b'250312')
```

- 密码：`250312`
- IV：12字节随机
- 格式：`base64(IV[12] + ciphertext + GCM_tag[16])`
- payload 格式：`{"content": ["行1", "行2", ...], "notes": ["注1"]}`

**注意：payload 字段必须是 `content`，不能用 `lines` 等其他名字，否则前端渲染为空。**

## 改诗标准流程

```python
import json, os, base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

SALT = bytes([113,105,108,118,45,108,97,116,116,105,99,101,45,107,100,102])
kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=SALT, iterations=250000)
key = kdf.derive(b'250312')

data = json.load(open('data/poems.json', encoding='utf-8'))
poem = next(p for p in data['poems'] if '诗题' in p['title'])

# 解密
raw = base64.b64decode(poem['encryptedContent'])
payload = json.loads(AESGCM(key).decrypt(raw[:12], raw[12:], None))

# 修改
payload['content'][N] = payload['content'][N].replace('旧', '新')

# 重新加密
iv = os.urandom(12)
ct = AESGCM(key).encrypt(iv, json.dumps(payload, ensure_ascii=False, separators=(',',':')).encode(), None)
poem['encryptedContent'] = base64.b64encode(iv + ct).decode()
poem['content'] = payload['content']  # 明文备份，必须同步更新

with open('data/poems.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=4)
```

用完删掉临时脚本：`rm _fix.py`

## 推送

```bash
git add data/poems.json
git commit -m "feat: 更新《诗题》"
git push
```

## 用户风格

- 说话直接，不喜欢废话和过度解释
- 改诗时"直接同步"意味着改完立刻 commit + push，不用再问
- 用"兄弟"称呼，轻松对话风格
- 诗词修改以用户给的版本为准，不要自行 diff，整体替换

## 站点分工

- 老站 `qilv-lattice-mobile-first` 是公开窗口，避免同步讽刺诗。
- 新站 `qilv-lattices` 是加密完整站，讽刺诗和完整作品集优先同步到新站。
