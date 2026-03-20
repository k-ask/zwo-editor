#!/bin/bash
echo "🚀 ワークアウトライブラリを更新しています..."
python3 update_library.py

if [ $? -ne 0 ]; then
    echo "❌ update_library.py の実行に失敗しました。処理を中断します。"
    exit 1
fi

echo "📦 変更をGitに追加しています..."
git add .

# 変更があるかチェック
if git diff-index --quiet HEAD --; then
    echo "✅ 変更がありません。アップロードは不要です。"
    exit 0
fi

echo "📝 コミットを作成しています..."
git commit -m "🚀 Auto update: App files & Workout library"

echo "☁️ GitHubにプッシュしています..."
git push origin main

echo "🎉 アップロードが完了しました！数分後に反映されます。"
