# VibeSketch AI 🎬✏️

Công cụ tạo video người que viral tự động bằng AI — từ ý tưởng đến hình ảnh, giọng đọc và ZIP xuất bản.

## ✨ Tính năng

- 🎯 Tạo tiêu đề viral theo chủ đề
- 📝 Viết kịch bản tự động (cảnh ngắn 2 giây)
- 🎨 Vẽ hình người que phong cách YouTube (FLUX.1)
- 🖼️ Tạo thumbnail
- 🎙️ Tạo giọng đọc AI (OpenRouter TTS)
- 📦 Xuất toàn bộ dự án dạng ZIP

## 🚀 Chạy local

```bash
# 1. Clone repo
git clone https://github.com/YOUR_USERNAME/vibesketch-ai.git
cd vibesketch-ai

# 2. Cài dependencies
npm install

# 3. Tạo file .env.local và điền API key
cp .env.example .env.local
# Sửa OPENROUTER_API_KEY=sk-or-xxxx (lấy tại https://openrouter.ai/keys)

# 4. Chạy dev server
npm run dev
# Mở http://localhost:3000
```

> ⚠️ Nếu gặp lỗi **SharedArrayBuffer/WASM**, hãy nhấn **Cmd+Shift+R** (Mac) hoặc **Ctrl+Shift+R** (Win) để hard reload.

## ☁️ Deploy Vercel

1. Push code lên GitHub
2. Vào [vercel.com](https://vercel.com) → **New Project** → Import repo
3. Thêm Environment Variable: `OPENROUTER_API_KEY` = `sk-or-xxxx`
4. Click **Deploy**

Headers COOP/COEP đã được cấu hình tự động trong `vercel.json`.

## 🔑 Lấy API Key

Truy cập [openrouter.ai/keys](https://openrouter.ai/keys) — có free tier.

## 🛠️ Tech Stack

- **React 19** + TypeScript + Vite
- **OpenRouter AI** (Gemini Flash/Pro, FLUX.1, OpenAI TTS)
- **Tailwind CSS** + Google Fonts (Patrick Hand)
- **JSZip** để xuất file
