# BOM SỐ

**BOM SỐ — Đừng chọn sai.** là game party 2–4 người với hai cách chơi:

- **CHƠI CÙNG NHAU:** hot-seat trên một thiết bị, chạy hoàn toàn local.
- **CHƠI ONLINE:** mỗi người một thiết bị, phòng 5 ký tự, Anonymous Auth, Supabase Realtime và gameplay do Postgres RPC quyết định.

## Luật chơi

Một số bom bí mật nằm trong phạm vi `1–99`. Mỗi lượt, người chơi khóa một số còn hợp lệ. Nếu an toàn, phạm vi co lại về phía vẫn chứa bom và lượt chuyển sang người tiếp theo. Chọn trúng bom — hoặc thua theo chính sách hết giờ của phòng — sẽ kết thúc ván.

## Cài đặt và chạy

Yêu cầu Node.js 22+.

```bash
npm install
npm run dev
```

Chế độ local luôn hoạt động khi không có Supabase và không thực hiện network request.

Để bật Online, sao chép `.env.example` thành `.env.local` và điền đúng hai giá trị browser-safe:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Không đưa service-role key, database password, JWT signing secret hoặc admin credential vào biến `VITE_*`. `.env.local` đã được Git ignore.

## Supabase local

Docker phải đang chạy. Supabase CLI đã được pin trong dev dependencies.

```bash
npm run supabase:start
npm run supabase:reset
npm run test:db
```

Các migration có thứ tự nằm trong [`supabase/migrations`](supabase/migrations). Local Supabase đã bật Anonymous Auth trong `supabase/config.toml`.

## Thiết lập Supabase hosted

1. Trong Supabase Dashboard, bật **Authentication → Providers → Anonymous Sign-Ins**.
2. Đăng nhập và liên kết Supabase CLI bằng tài khoản có quyền trên project.
3. Áp dụng migrations:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --include-all
```

Publishable key không có quyền áp dụng migration. Không thay backend authority bằng logic frontend nếu thiếu quyền quản trị.

## Kiểm thử và quality gates

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:db
npm run test:e2e
npm run build
```

`npm run test:e2e` cần repo-local Supabase đang chạy và tự lấy duy nhất API URL + publishable/anon key từ local CLI mà không in credential. Chỉ chạy regression local không cần Supabase bằng:

```bash
npm run test:e2e:local
```

Nếu thiếu Chromium: `npx playwright install chromium`.

## Deploy GitHub Pages

Workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) build với Vite base `/number-bomb/`. Tạo hai **GitHub Actions repository variables** trước khi deploy Online:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Join links dùng query `?room=XXXXX`, nên hoạt động với GitHub Pages mà không cần route fallback.

## Kiến trúc và bảo mật

- Local authority giữ nguyên trong `src/game/reducer.ts`; online không thêm networking field vào local `GameState`.
- Online canonical state chỉ thay đổi qua `SECURITY DEFINER` RPC; client không trực tiếp ghi các bảng gameplay.
- Số bom và pending outcome nằm trong schema `private` cho đến khi game `FINISHED`.
- Một private Realtime channel `room:<ROOM_UUID>` cung cấp Postgres Changes, Presence và provisional selection. Presence/provisional data chỉ phục vụ UI, không có quyền quyết định gameplay.
- RPC mutation dùng UUID idempotency key; reconnect dùng subscribe-then-snapshot và server clock estimation.

Contract thiết kế: [`docs/architecture/nb-3a-online-multiplayer-supabase-contract.md`](docs/architecture/nb-3a-online-multiplayer-supabase-contract.md). Trạng thái triển khai/handoff: [`docs/architecture/nb-3b-online-implementation.md`](docs/architecture/nb-3b-online-implementation.md).

## Công nghệ

React, TypeScript, Vite, CSS thuần, Web Audio API, Supabase/Postgres/Realtime, Vitest, pgTAP và Playwright.
