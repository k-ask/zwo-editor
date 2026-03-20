#!/bin/bash

# このスクリプトが置かれているフォルダ（プロジェクトのルート）に移動する
cd "$(dirname "$0")"

echo "===================================="
echo "🚀 zwo-editor 自動アップロードツール"
echo "===================================="
echo ""
echo "[1/4] 📂 ワークアウトファイルの読み込み..."

# PythonスクリプトでJSファイルを生成
python3 update_library.py
if [ $? -ne 0 ]; then
    echo ""
    echo "❌ エラーが発生しました (update_library.py の失敗)"
    echo "ターミナルウィンドウを閉じるか、Enterで終了してください..."
    read
    exit 1
fi

echo ""
echo "[2/4] 📦 変更されたファイルのチェック中..."
git add .

# 変更がなければスキップ
if git diff-index --quiet HEAD --; then
    echo "✅ 変更がありませんでした。GitHubへのアップロードは不要です。"
    echo "Enterキーを押して終了してください..."
    read
    exit 0
fi

echo "[3/4] 📝 アップロードの準備中 (Commit)..."
git commit -m "🚀 Auto update: App files & Workout library" > /dev/null

echo ""
echo "[4/4] ☁️ GitHubへアップロード (Push)..."
git push origin main

echo ""
echo "===================================="
echo "🎉 全ての作業が完了しました！"
echo " 数分後にモバイル版・PC版どちらも更新が適用されます。"
echo "===================================="
echo ""
echo "Enterキーを押してウィンドウを閉じてください..."
read
