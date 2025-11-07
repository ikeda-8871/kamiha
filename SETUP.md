# 開発者向けセットアップガイド / Developer Setup Guide

このガイドでは、このプロジェクトをフォーク・カスタマイズし、自分のGitHub Pagesで公開する手順を詳しく説明します。

## アーキテクチャ概要

このプロジェクトは、コード（パブリック）とデータ（プライベート）を分離して管理する二重リポジトリ構成を採用しています。

### なぜデータを分離するのか？

- **プライバシー保護**: カード画像やデータを公開せずに、アプリケーションコードだけを公開できます
- **アクセス制御**: データリポジトリへのアクセスを制限できます
- **柔軟な管理**: データとコードを独立して更新・管理できます

### リポジトリ構成

```
kamiha/                 # パブリックリポジトリ（コード）
├── index.html          # メインHTML
├── app.js              # JavaScriptロジック
├── styles.css          # スタイルシート
├── .github/
│   └── workflows/
│       └── deploy.yml  # GitHub Actionsワークフロー
├── main.py             # Python CLI (参考用)
├── update_cards.py     # データ更新スクリプト
└── README.md

kamiha-data/            # プライベートリポジトリ（データ）
└── data/
    ├── cards.json      # カードデータ
    └── images/         # カード画像
        ├── sample0001.png
        ├── sample0002.png
        └── ...
```

## 前提条件

- GitHubアカウント
- Gitクライアント
- 既存の `data/` フォルダの内容

## ステップバイステップ手順

### ステップ1: プライベートデータリポジトリの作成

1. **GitHubで新しいリポジトリを作成**
   - https://github.com/new にアクセス
   - Repository name: `kamiha-data`
   - Description: `Private data repository for kamiha deck builder`
   - **必ず "Private" を選択**
   - "Add a README file" のチェックは外す
   - Create repository をクリック

2. **ローカルでデータリポジトリを初期化**

```bash
# 新しいフォルダを作成（既存のkamihaの外で）
mkdir kamiha-data
cd kamiha-data

# Gitリポジトリを初期化
git init
git branch -M main

# リモートリポジトリを追加（YOUR_USERNAMEを実際のユーザー名に置き換え）
git remote add origin https://github.com/YOUR_USERNAME/kamiha-data.git
```

3. **既存のdataフォルダの内容をコピー**

```bash
# kamihaリポジトリからdataフォルダの内容をコピー
# Windowsの場合:
xcopy /E /I /Y ..\kamiha\data\* .

# macOS/Linuxの場合:
cp -r ../kamiha/data/. .
```

4. **コミットしてプッシュ**

```bash
# すべてのファイルを追加
git add .

# コミット
git commit -m "Initial commit: Add card data and images"

# プッシュ
git push -u origin main
```

5. **確認**
   - https://github.com/YOUR_USERNAME/kamiha-data にアクセス
   - `cards.json` と `images/` フォルダが表示されることを確認
   - リポジトリが "Private" になっていることを確認

### ステップ2: Personal Access Tokenの作成

GitHub Actionsがプライベートリポジトリにアクセスするために必要です。

1. **GitHub Settingsを開く**
   - 右上のプロフィールアイコン → Settings

2. **Developer settingsへ移動**
   - 左サイドバーの一番下にある "Developer settings" をクリック

3. **Personal access tokensページへ**
   - "Personal access tokens" → "Tokens (classic)" をクリック
   - "Generate new token" → "Generate new token (classic)" をクリック

4. **トークンの設定**
   - **Note**: `kamiha-data-access`（わかりやすい名前）
   - **Expiration**:
     - 開発中: `90 days` または `180 days`
     - 本番環境: `No expiration`（定期的な更新を推奨）
   - **Select scopes**:
     - ✅ `repo` (Full control of private repositories) にチェック
       - これにより、すべてのサブ項目も自動的にチェックされます

5. **トークンを生成して保存**
   - "Generate token" をクリック
   - **重要**: 表示されたトークンを今すぐコピーしてください
   - 形式: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - ⚠️ **このページを離れると二度と表示されません！**
   - 安全な場所に一時的に保存（パスワードマネージャーなど）

### ステップ3: Secretの設定

パブリックリポジトリにPersonal Access Tokenを安全に設定します。

1. **パブリックリポジトリ (kamiha) のSettingsを開く**
   - https://github.com/YOUR_USERNAME/kamiha/settings にアクセス

2. **Secrets and variables → Actionsへ**
   - 左サイドバーから "Secrets and variables" を展開
   - "Actions" をクリック

3. **New repository secretをクリック**
   - 緑色の "New repository secret" ボタンをクリック

4. **Secretを追加**
   - **Name**: `DATA_REPO_TOKEN`（正確にこの名前で！）
   - **Secret**: 先ほどコピーしたPersonal Access Token を貼り付け
   - "Add secret" をクリック

5. **確認**
   - "DATA_REPO_TOKEN" が Repository secrets リストに表示されることを確認
   - 値は表示されません（セキュリティのため）

### ステップ4: GitHub Pagesの有効化

1. **パブリックリポジトリ (kamiha) のSettingsを開く**
   - https://github.com/YOUR_USERNAME/kamiha/settings にアクセス

2. **Pagesページへ移動**
   - 左サイドバーから "Pages" をクリック

3. **Sourceを設定**
   - "Build and deployment" セクション
   - **Source**: "GitHub Actions" を選択
   - （古い設定の場合は "Deploy from a branch" から変更）

4. **保存**
   - 特に保存ボタンはありません（自動保存）

### ステップ5: デプロイのテスト

1. **変更をプッシュ**
   - パブリックリポジトリに何か変更をプッシュ（READMEを少し編集するなど）

```bash
cd kamiha
# 軽微な変更
echo "\n<!-- Updated -->" >> README.md
git add README.md
git commit -m "Test deployment with private data"
git push
```

2. **Actionsタブで確認**
   - https://github.com/YOUR_USERNAME/kamiha/actions
   - "Deploy to GitHub Pages" ワークフローが実行されることを確認
   - 緑色のチェックマーク ✓ で成功を確認

3. **ページを確認**
   - https://YOUR_USERNAME.github.io/kamiha/ にアクセス
   - カードデータが正常に読み込まれることを確認
   - ブラウザの開発者ツール (F12) → Console でエラーがないか確認

## トラブルシューティング

### ワークフローが失敗する

**エラー**: `HttpError: Resource not accessible by integration`
- **原因**: Personal Access Tokenが正しく設定されていない
- **解決策**:
  - Secretの名前が `DATA_REPO_TOKEN` であることを確認
  - トークンに `repo` スコープがあることを確認
  - 新しいトークンを作成して再設定

**エラー**: `Repository not found`
- **原因**: プライベートリポジトリ名が間違っている
- **解決策**:
  - `.github/workflows/deploy.yml` の `repository:` の値を確認
  - 形式: `YOUR_USERNAME/kamiha-data`

### カードが表示されない

**症状**: ページは表示されるが、カードが読み込まれない
- **確認事項**:
  1. ブラウザのコンソール (F12) でエラーを確認
  2. `data/cards.json` が存在するか確認
  3. `data/images/` フォルダが存在するか確認
- **解決策**:
  - Actionsタブでデプロイが成功しているか確認
  - プライベートリポジトリにファイルが正しくあるか確認

### ローカルで動かない

**症状**: ローカルサーバーでカードが表示されない
- **原因**: `data/` フォルダがない
- **解決策**:

```bash
cd kamiha
git clone https://github.com/YOUR_USERNAME/kamiha-data.git data
```

## よくある質問

### Q: トークンの有効期限が切れたらどうなりますか？

A: デプロイが失敗します。新しいトークンを作成して、同じ手順でSecretを更新してください。

### Q: プライベートリポジトリを変更したらデプロイはどうなりますか？

A: プライベートリポジトリへの変更は、パブリックリポジトリに変更をプッシュするまで反映されません。

### Q: データだけを更新したい場合は？

A:
1. プライベートリポジトリ (kamiha-data) に変更をプッシュ
2. パブリックリポジトリ (kamiha) で軽微な変更をプッシュ（READMEにコメント追加など）
3. ワークフローが自動実行され、最新のデータで再デプロイされます

または、手動でワークフローを実行:
- Actions タブ → "Deploy to GitHub Pages" → "Run workflow"

### Q: コストはかかりますか？

A:
- GitHubリポジトリ: 無料（プライベートリポジトリも無料）
- GitHub Pages: 無料（パブリックリポジトリの場合）
- GitHub Actions: 無料枠あり（月2,000分）

## ローカル開発環境のセットアップ

### 両方のリポジトリをクローン

```bash
# パブリックリポジトリをクローン
git clone https://github.com/YOUR_USERNAME/kamiha.git
cd kamiha

# プライベートデータリポジトリを data/ にクローン
git clone https://github.com/YOUR_USERNAME/kamiha-data.git data-temp
mv data-temp/data ./data
rm -rf data-temp
```

### ローカルサーバーで動作確認

**方法1: Python HTTPサーバー**

```powershell
# PowerShell
python -m http.server 8000
```

```bash
# macOS/Linux
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開く

**方法2: VS Code Live Server**

1. [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) 拡張機能をインストール
2. `index.html` を右クリック → `Open with Live Server`

### カードデータの更新

```bash
# dataディレクトリで作業
cd data

# update_cards.pyを実行（親ディレクトリから）
python ../update_cards.py

# 変更をコミット（kamiha-dataリポジトリへ）
git add .
git commit -m "Update card data"
git push

# パブリックリポジトリ側でデプロイをトリガー
cd ..
echo "\n<!-- Trigger deploy -->" >> README.md
git add README.md
git commit -m "Trigger deployment with updated data"
git push
```

## ワークフロー詳細

`.github/workflows/deploy.yml` の動作:

1. **パブリックリポジトリをチェックアウト**: コードを取得
2. **プライベートリポジトリをチェックアウト**: Personal Access Tokenを使用してデータを取得
3. **データディレクトリを再配置**: `data-temp/data` → `data` に移動
4. **GitHub Pagesにデプロイ**: 全体をアーティファクトとしてアップロード・公開

### ワークフローのカスタマイズ

リポジトリ名が異なる場合は `.github/workflows/deploy.yml` を編集:

```yaml
- name: Checkout private data repository
  uses: actions/checkout@v4
  with:
    repository: YOUR_USERNAME/YOUR_DATA_REPO  # ← ここを変更
    token: ${{ secrets.DATA_REPO_TOKEN }}
    path: data-temp
```

## セキュリティのベストプラクティス

1. **Personal Access Tokenは絶対に公開しない**
   - コードにハードコードしない
   - GitHub Secretsに保存する

2. **最小権限の原則**
   - トークンには必要最小限のスコープのみを付与
   - この場合は `repo` スコープのみ

3. **定期的なトークンの更新**
   - 有効期限を設定し、定期的に更新する
   - 古いトークンは無効化する

4. **アクセスログの確認**
   - 定期的にリポジトリのアクセスログを確認
   - 不審なアクセスがないか監視

## まとめ

これで、コードはパブリックに公開しながら、データをプライベートに保つことができます！

- ✅ コード: パブリックリポジトリ `kamiha`
- ✅ データ: プライベートリポジトリ `kamiha-data`
- ✅ デプロイ: GitHub Actions が自動的に両方を組み合わせてデプロイ
- ✅ 公開: GitHub Pages で誰でもアクセス可能

