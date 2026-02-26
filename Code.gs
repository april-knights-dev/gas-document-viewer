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

/** @const {number} フォルダの再帰上限（深さ制限） */
const MAX_DEPTH = 10;

/** @const {number} Drive APIリトライ回数上限 */
const MAX_RETRIES = 3;

/**
 * 指定フォルダ配下のGoogleドキュメントを再帰的に取得する
 * @return {Array<Object>} ツリー構造のファイル/フォルダ一覧
 */
function getDocumentTree() {
  const rootFolder = DriveApp.getFolderById(FOLDER_ID);
  return buildTree_(rootFolder, 0);
}

/**
 * Drive API を呼び出すラッパー（エラー時にリトライ）
 * @param {Function} fn - 実行する関数
 * @return {*} 関数の戻り値
 * @private
 */
function callDriveApi_(fn) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return fn();
    } catch (e) {
      if (attempt === MAX_RETRIES - 1) throw e;
      // クォータ超過・サービスエラーの場合はウェイトしてリトライ
      Utilities.sleep(Math.pow(2, attempt) * 1000);
    }
  }
}

/**
 * フォルダを再帰的に走査してツリー構造を構築する（内部関数）
 * @param {Folder} folder - 対象フォルダ
 * @param {number} depth - 現在の深さ
 * @return {Array<Object>} ノード配列
 * @private
 */
function buildTree_(folder, depth) {
  if (depth >= MAX_DEPTH) {
    console.warn('最大深さ(%s)に達したためスキップ: %s', MAX_DEPTH, folder.getName());
    return [];
  }

  // サブフォルダを処理
  const folderNodes = [];
  const subFolders = callDriveApi_(function() { return folder.getFolders(); });
  while (subFolders.hasNext()) {
    const sub = callDriveApi_(function() { return subFolders.next(); });
    try {
      folderNodes.push({
        type: 'folder',
        name: sub.getName(),
        children: buildTree_(sub, depth + 1)
      });
    } catch (e) {
      console.error('フォルダ処理エラー: %s', e.message);
    }
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
    let files;
    try {
      files = callDriveApi_(function() { return folder.getFilesByType(entry.mime); });
    } catch (e) {
      console.error('ファイル一覧取得エラー (%s): %s', entry.fileType, e.message);
      return;
    }
    while (files.hasNext()) {
      let file;
      try {
        file = callDriveApi_(function() { return files.next(); });
        const url = file.getUrl();
        // PDFは /view → /preview、Docsは /edit のまま、その他は /edit → /preview に変換
        const viewUrl = entry.fileType === 'pdf'
          ? url.replace(/\/view.*$/, '/preview')
          : entry.fileType === 'doc'
            ? url.replace(/\/edit.*$/, '/edit')
            : url.replace(/\/edit.*$/, '/preview');
        fileNodes.push({
          type: 'file',
          fileType: entry.fileType,
          name: file.getName(),
          url: viewUrl
        });
      } catch (e) {
        console.error('ファイル処理エラー: %s', e.message);
      }
    }
  });

  // 名前順でソート（フォルダ→ファイルの順序は維持）
  folderNodes.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  fileNodes.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  return [...folderNodes, ...fileNodes];
}
