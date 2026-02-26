// ============================================================
// GASカスタムビューアー - バックエンド
// ============================================================
// 使い方:
//   1. このファイルの FOLDER_ID を対象フォルダのIDに書き換える
//   2. GASプロジェクトにこのファイルと index.html を配置
//   3. デプロイ → ウェブアプリとしてデプロイ
// ============================================================

/**
 * Google Docs REST API でタブ一覧を取得する（内部関数）
 * @param {File} file - DriveApp.File オブジェクト
 * @param {string} previewUrl - ドキュメントのプレビューURL
 * @return {Array<Object>|null} タブ配列、またはタブが1つ以下なら null
 * @private
 */
function getDocTabs_(file, previewUrl) {
  try {
    var token = ScriptApp.getOAuthToken();
    var res = UrlFetchApp.fetch(
      'https://docs.googleapis.com/v1/documents/' + encodeURIComponent(file.getId()) + '?fields=tabs.tabProperties',
      { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true }
    );
    if (res.getResponseCode() !== 200) return null;
    var tabs = JSON.parse(res.getContentText()).tabs || [];
    if (tabs.length <= 1) return null;
    return tabs.map(function(t) {
      var props = t.tabProperties || {};
      return {
        title: props.title || 'タブ',
        url: previewUrl + '?tab=t.' + props.tabId
      };
    });
  } catch (e) {
    return null;
  }
}

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
  // サブフォルダを処理
  const folderNodes = [];
  const subFolders = folder.getFolders();
  while (subFolders.hasNext()) {
    const sub = subFolders.next();
    folderNodes.push({
      type: 'folder',
      name: sub.getName(),
      children: buildTree_(sub)
    });
  }

  // 対応するファイル種別
  const mimeTypes = [
    { mime: MimeType.GOOGLE_DOCS,   fileType: 'doc'   },
    { mime: MimeType.GOOGLE_SHEETS, fileType: 'sheet' },
    { mime: MimeType.GOOGLE_SLIDES, fileType: 'slide' },
    { mime: MimeType.PDF,           fileType: 'pdf'   }
  ];

  const fileNodes = [];
  mimeTypes.forEach(function(entry) {
    const files = folder.getFilesByType(entry.mime);
    while (files.hasNext()) {
      const file = files.next();
      const url = file.getUrl();
      // PDFは /view → /preview、その他は /edit → /preview に変換
      const previewUrl = entry.fileType === 'pdf'
        ? url.replace(/\/view.*$/, '/preview')
        : url.replace(/\/edit.*$/, '/preview');
      const node = {
        type: 'file',
        fileType: entry.fileType,
        name: file.getName(),
        url: previewUrl
      };

      // Googleドキュメントのタブを取得（複数タブがある場合のみ）
      if (entry.fileType === 'doc') {
        const tabs = getDocTabs_(file, previewUrl);
        if (tabs) node.tabs = tabs;
      }

      fileNodes.push(node);
    }
  });

  // 名前順でソート（フォルダ→ファイルの順序は維持）
  folderNodes.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  fileNodes.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  return [...folderNodes, ...fileNodes];
}
