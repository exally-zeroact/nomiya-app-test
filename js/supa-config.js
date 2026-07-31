/* supa-config.js — ★テスト用DB★（nomiya-app-test / テスト配信専用）
 * 本番倉庫(tnfwipbgfgjaymlszeid)とは別の Supabase「DB-test」を指す。
 * URLとpublishable(公開鍵)はクライアント埋め込みで安全＝RLSで本人ぶんだけ保護。
 *
 * ★このファイルは本番(nomiya-app)には絶対にコピーしない。
 *   飲み屋アプリで2つのrepoが違うのは、このファイル1本だけ。
 *   （payslip-app / payslip-app-test と同じやり方）
 */
window.SUPA = {
  url: "https://khawdrnvssdenumbiwfg.supabase.co",
  key: "sb_publishable_UrRIobyVFbaJI_85RBxBOA_GZ4OUxPm",
};
