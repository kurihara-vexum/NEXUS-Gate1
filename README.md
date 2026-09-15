# NEXUS 社内問い合わせ管理システム

Gate1要件に基づく「ステータス変更・担当者割り当て」機能です。問い合わせの登録・一覧表示は既存機能という前提で、問い合わせ詳細画面と更新APIを実装しています。

## 動作環境

- Node.js 22.5以上（`node:sqlite`を使用）
- 外部パッケージなし

## 起動

```bash
npm start
```

起動後、`http://localhost:3000/inquiries/1` を開きます。初回起動時に `data/nexus.sqlite` とサンプルデータが作成されます。

## サンプル画面

- `/inquiries/1?actorId=2`：MEMBER、NEW・未割り当て
- `/inquiries/2?actorId=1`：ADMIN、IN_PROGRESS
- `/inquiries/4?actorId=1`：ADMIN、DONE

検証要件に合わせ、PENDING画面では「対応中」と「完了」を表示します。「完了」はサーバー側で不正遷移として拒否され、エラーメッセージが表示されます。状態遷移ルール自体は変更していません。

ログイン機能は既存という想定のため、デモ環境では `actorId` クエリでログインユーザーを表現しています。更新時の権限は画面制御だけでなくサーバー側でも検証します。

## テスト

```bash
npm test
```

状態遷移、再オープン、`closed_at`、自動担当者設定、権限、有効ユーザー、文字数、楽観ロック、トランザクションのロールバックを確認します。

## 実装構成

- `src/domain/status.js`：状態遷移表
- `src/domain/assignee-policy.js`：担当者割り当て業務ルール
- `src/domain/messages.js`：仕様指定メッセージ
- `src/services/inquiry-service.js`：更新ユースケースとトランザクション
- `src/db.js`：テーブル定義とデモデータ
- `src/server.js`：HTTP APIと静的ファイル配信
- `public/`：問い合わせ詳細画面と表示ルール
- `test/`：業務ルールの自動テスト

## API

- `GET /api/inquiries/:id?actorId=:actorId`
- `POST /api/inquiries/:id/status`
- `POST /api/inquiries/:id/assignee`
