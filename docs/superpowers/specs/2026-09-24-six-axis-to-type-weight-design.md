# 六軸評估系統改成零件類型比重

**狀態**：設計已跟使用者逐段確認，待書面 spec 審核。
**規格對照**：`BEYBLADE_X_codex_prompt.md` 第 20、50.5、50.7 節。

## 1. 背景與動機

`analysis.ts` 的 `BASE_BY_TYPE` 是一張手動填寫的表：四種官方零件類型（攻擊／防守／
持久／均衡）各自對應一組六個數字（attack/defense/stamina/burst/burstResistance/
stability，0–100），組配時依上蓋 0.5／軸心 0.3／固鎖 0.2 的槽位權重混合。這六個數字
沒有任何來源，是最初開發時憑感覺填的。

2026-09-24 這輪已經先拔掉了這張表的「判強弱」用途（`overallStrengthGain`／
「整體強度」排序，見規格第 50.5 節）——那條加權公式代入四種純類型會得到攻擊型 48
分、防守型 57 分，系統性把攻擊型排最後，跟賽場實況（冠軍隊常見兩顆以上攻擊型）矛盾。

`BASE_BY_TYPE` 剩下的「判形狀」用途（`assignRoles()` 的主攻／持久／穩定分工、
`vs_attack`／`vs_stamina` 策略、配裝器的六條分數條）還在用同一張沒有來源的表。分析
發現這六個數字本質上只帶著一份資訊——「這套配裝攻擊型／防守型／持久型／均衡型
各佔多少比重」，其餘的「爆發」「抗爆」「穩定」都只是圍繞著攻擊／防守／持久編出來的
裝飾數字，同一批類型組合只會產生 58 種不同的六軸向量（64 種類型組合裡）。

**目標**：把六軸換成「零件類型比重」——直接呈現零件本身就有的 `type` 標籤加權混合
出的比例，不再假裝是可以判斷強弱或有六個獨立面向的分數。

**非目標**：
- 不動 `operationDifficulty`（操作難度，跟類型無關的獨立邏輯）。
- 不動賽事證據（`evidence`）、CX 相容性規則、零件強度 fallback（已在前一輪處理完的
  獨立系統）。
- 不校正上蓋／固鎖／軸心的槽位權重（0.5／0.3／0.2）——見第 5 節，已測試過資料不支持。

## 2. 資料模型

`ComboScores`（6 個欄位）整個換成：

```ts
export interface TypeWeight {
  attack: number   // 0–100，四捨五入後加總為 100
  defense: number
  stamina: number
  balance: number
}
```

- 加總為 100 的做法：三個算四捨五入，第四個（`balance`）用 `100 - 其餘三個總和`
  推算，避免四捨五入誤差讓總和變成 99 或 101。
- 沒有任何零件有 `type` 資料時（例如全部槽位都缺類型資訊），沿用現有慣例回傳
  `undefined`，前台顯示「資料不足」，不得顯示 `{attack:0, defense:0, ...}`
  這種看起來像「均衡」其實是「沒資料」的假結果。
- `estimateScores()` 改名 `estimateTypeWeight()`。
- `ComboAnalysis.scores` 欄位改名 `typeWeight`（原欄位名 `scores` 本身就是這次要
  修正的誤導之一，一次改乾淨，不留舊名當相容殼）。
- `burst`／`burstResistance`／`stability` 三個獨立軸位整個移除，不保留、不算成
  其他軸的別名。

## 3. 各消費端改法

| 現況 | 改法 |
|---|---|
| 配裝器「六軸評估」六條分數條（`BuilderPage.tsx`） | 改成「零件類型比重」四條百分比條（攻擊／防守／持久／均衡），區塊標題與說明文字要講清楚這是零件組成比例，不是強度分數 |
| `assignRoles()`（`deck.ts`，3on3 主攻/持久/穩定分工） | 主攻→`typeWeight.attack` 最高、持久→`typeWeight.stamina` 最高、**穩定→`typeWeight.defense` 最高**（現有排序選單沒有獨立的「防守最高」選項，用防守佔比頂替「最穩」不會跟既有功能撞名） |
| `builder.ts` 的 `BuildableSortKey`（攻擊最高／持久最高／最穩） | 攻擊、持久直接對應 `typeWeight.attack`／`typeWeight.stamina`；「最穩」比照上面改用 `typeWeight.defense`。`AXIS_BASE` 那張手填的剪枝用查表整個刪掉，改成二元判斷：零件的 `type` 直接命中目標軸就排最前，其餘同分，用 `code` 字典序 tie-break（不再編一組虛構的相對大小關係） |
| `recommendations.ts` 的 `axisGains`（攻擊峰值/持久峰值/穩定峰值文案） | 同上，穩定峰值改用 `typeWeight.defense` |
| `deck.ts` 的 `vs_attack`／`vs_stamina` 策略 | 原本各自加總兩個相關軸（`defense + burstResistance`／`attack + burst`），現在只剩一個對應軸可用（`defense`／`attack`）。實作時要跑現有測試確認拿掉重複軸後，跟 `competitiveEvidenceWithFallback * 0.35` 等其他項目的相對權重沒有讓策略排序失真；如果失真就把單軸乘一個係數補回原本的量級，數字由測試決定，不在 spec 裡先猜 |
| `buildProsCons()`（`analysis.ts`，優缺點「攻擊表現最突出」） | 改成掃 `TypeWeight` 四個欄位找最高／最低，文字模板從「XX 表現最突出（N 分）」改成「XX 型佔比最高（N%）」 |
| `buildComboVerdict()`（`reasons.ts`，一句話「強在X弱在Y」） | 同上改成看類型比重；原本「差距 <12 分不講偏向」的門檻要重新校準——百分比的分布特性跟原本假分數不同，實作階段寫測試找出合理門檻，不在 spec 裡先定數字 |

## 4. 影響範圍

**會改的檔案**：`analysis.ts`、`builder.ts`、`deck.ts`、`recommendations.ts`、
`buildableRows.ts`、`reasons.ts`、`BuilderPage.tsx`。

**會改的測試**：`tests/unit/analysis.test.ts`、`builder.test.ts`、`deck.test.ts`、
`recommendations.test.ts`、`buildableRows.test.ts`、`reasons.test.ts`——這些檔案
現有斷言大量依賴 `ComboScores` 的六個欄位與具體分數數字，型別改掉後全部要跟著改，
不是新增測試而是重寫既有測試的期望值。

**不動的檔案**：`compatibility.ts`（相容性規則跟類型無關）、`partStrength.ts`／
零件強度相關（獨立系統）、`competitiveMeta.ts`（賽事證據，獨立系統）。

## 5. 槽位權重（TYPE_WEIGHT）不校正的理由

使用者問過能不能用零件強度那套驗證方法（時間切分＋Spearman 持續性）順便校正
`TYPE_WEIGHT`（上蓋 0.5／固鎖 0.2／軸心 0.3）。2026-09-24 實測過：分別對三個槽位
各自算「零件本身名氣的時間持續性」——

| 槽位 | Spearman | n |
|---|---|---|
| 上蓋 | 0.866 | 27 |
| 軸心 | 0.861 | 25 |
| 固鎖 | 0.739 | 19 |

上蓋跟軸心幾乎打平，跟「上蓋權重遠高於軸心」的假設對不起來；固鎖較低但 n=19 太小，
無法排除是雜訊。更根本的問題是：這個測試量的是「零件本身的名氣穩不穩定」，不是
`TYPE_WEIGHT` 真正要回答的「這個槽位的類型標籤決定整套配裝打法形狀的程度」——這兩者
沒有必然關係，資料裡沒有可以回歸這個問題的目標變數。

**結論**：`TYPE_WEIGHT` 維持現狀（0.5／0.3／0.2），不在這次改動範圍內。跟
`BASE_BY_TYPE` 不同的是，`TYPE_WEIGHT` 沒有宣稱在判斷強弱、也沒有被驗算出系統性
錯誤方向，只是「上蓋比固鎖軸心更能代表打法形狀」這個結構性假設，符合一般玩家直覺，
沒有急迫性。程式碼裡要留一句註解記錄這次測試過、資料不支持校正，避免以後有人以為
沒人查過。

## 6. 測試策略

- 沿用 TDD：每個消費端改動前先把對應測試檔的期望值改成新介面該有的行為，跑紅之後
  再改實作，不是先改實作再回頭補測試。
- `buildComboVerdict()` 的門檻值（現在是 12 分）要用測試反推新的合理值，不能憑感覺
  抄一個新數字。
- `vs_attack`／`vs_stamina` 拿掉重複軸後，用既有的 `deck.test.ts` 測試確認排序行為
  沒有變得不合理（例如原本該被 `vs_attack` 選出來的防守型隊伍，改動後還是排得出來）。
- 改動完成後照 `CLAUDE.md` 規則跑 `npx tsc -b` + `npm test`，屬於前台程式改動，
  上線前要跑完整 `npm run test:e2e` + `npm run shots` 這一套。

## 7. 已知取捨

- 「零件類型比重」四個數字雖然是百分比、看起來精確，但跟六軸假分數不同——它們是
  從零件真實的 `type` 標籤按已知槽位權重算出來的加權平均，不是編出來的，屬於誠實
  呈現真實資料的組成比例，不是模型推估的分數。
- `vs_attack`／`vs_stamina` 少了「爆發」「抗爆」這兩個裝飾軸之後，策略描述的精細度
  會下降（原本聽起來像考慮了兩個維度，現在誠實地只有一個），但這本來就是拿掉假精度
  的必然結果，不是這次改動的副作用要另外解決。
