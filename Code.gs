// ============================================================
// GASカスタムビューアー - バックエンド
// ============================================================
// 使い方:
//   1. このファイルの FOLDER_ID を対象フォルダのIDに書き換える
//   2. GASプロジェクトにこのファイルと index.html を配置
//   3. デプロイ → ウェブアプリとしてデプロイ
// ============================================================

/** @const {string} 対象フォルダのID（ここを書き換える） */
const FOLDER_ID = 'ここにフォルダIDを入れる';

/**
 * Webアプリのエントリーポイント
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('ドキュメントビューアー')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 指定フォルダ配下のGoogleドキュメントを再帰的に取得する
 * @return {Array<Object>} ツリー構造のファイル/フォルダ一覧
 */
function getDocumentTree() {
  const rootFolder = DriveApp.getFolderById(FOLDER_ID);
  return buildTree_(rootFolder);
}

/**
 * フォルダを再帰的に走査してツリー構造を構築する（内部関数）
 * @param {Folder} folder - 対象フォルダ
 * @return {Array<Object>} ノード配列
 * @private
 */
function buildTree_(folder) {
  const nodes = [];

  // サブフォルダを先に処理（フォルダが上に来る方が自然）
  const subFolders = folder.getFolders();
  while (subFolders.hasNext()) {
    const sub = subFolders.next();
    nodes.push({
      type: 'folder',
      name: sub.getName(),
      children: buildTree_(sub)
    });
  }

  // フォルダ内のGoogleドキュメントを取得
  const files = folder.getFilesByType(MimeType.GOOGLE_DOCS);
  while (files.hasNext()) {
    const file = files.next();
    nodes.push({
      type: 'file',
      name: file.getName(),
      // /edit を /preview に置き換えてiframe埋め込み可能にする
      url: file.getUrl().replace(/\/edit.*$/, '/preview')
    });
  }

  // 名前順でソート（フォルダ→ファイルの順序は維持）
  const folders = nodes.filter(n => n.type === 'folder').sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const fileNodes = nodes.filter(n => n.type === 'file').sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  return [...folders, ...fileNodes];
}
