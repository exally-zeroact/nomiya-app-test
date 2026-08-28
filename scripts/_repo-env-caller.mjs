/* _repo-env-caller.mjs — ★見本★（試験ではない・頭が _ なので見張りの数に入らない）
 * scripts/repo-env.mjs --self-test が ★この物を --self-test 付きで走らせて★
 * 「取り込まれた側が 勝手に道具として動き出さないか」を確かめる。
 * ＝2026-08-26 に repo-env が env-badge / no-hardcoded-supa の自己確認を
 *   ★取り込まれた瞬間の exit(0) で 緑にすり替えていた★ 型の再発を止める。
 */
import { envOf } from './repo-env.mjs';

console.log('よそから取り込んだ: ' + envOf("window.SUPA={ env: 'test' };"));
