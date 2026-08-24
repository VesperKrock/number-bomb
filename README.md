# BOM SỐ

**BOM SỐ — Đừng chọn sai.** là game party cục bộ dành cho 2–4 người. Người chơi chuyền thiết bị sau mỗi lượt, chọn một số trong phạm vi còn hợp lệ và cố tránh số bom bí mật.

## Chạy dự án

```bash
npm install
npm run dev
```

Mở địa chỉ Vite in ra trong terminal (thường là `http://localhost:5173`).

## Luật chơi

Một số bom được tạo ngẫu nhiên trong phạm vi 1–99. Nếu lựa chọn an toàn, toàn bộ phía không thể chứa bom bị loại và lượt chuyển sang người tiếp theo. Chọn đúng số bom sẽ kết thúc ván; người vừa chọn thua.

## Kiểm thử và chất lượng

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:e2e
npm run build
```

Nếu Playwright chưa có trình duyệt Chromium trên máy, chạy `npx playwright install chromium` một lần.

## Công nghệ

React, TypeScript, Vite, CSS thuần, Web Audio API, Vitest và Playwright. Game không cần backend, tài khoản hay kết nối mạng khi đang chơi.
