/**
 * 3on3 組隊。
 *
 * 規格對照：第 32 節（庫存、未到貨、相容性、重複零件限制、角色分工、推薦模式）、
 * 第 33 節（角色標示、原因說明、占用零件、替代方案）、第 45 節 Case 9。
 */
import { useMemo, useState } from 'react'
import { repo, useAppStore } from '../../store/appStore.ts'
import { generateBuildableCombos } from '../../domain/builder.ts'
import {
  DECK_STRATEGY_ZH,
  DEFAULT_DECK_RULES,
  suggestDecks,
  validateDeck,
  type DeckStrategy,
} from '../../domain/deck.ts'
import { resolveDisplayName } from '../../domain/naming.ts'
import { Link } from '../router.tsx'
import {
  Badge,
  EmptyState,
  EstimateBadge,
  NoticeCard,
  PageHeader,
  Row,
  Section,
} from '../components/ui.tsx'

export function DecksPage() {
  const parts = useAppStore((state) => state.parts)
  const rules = useAppStore((state) => state.rules)
  const lots = useAppStore((state) => state.lots)
  const combos = useAppStore((state) => state.combos)
  const decks = useAppStore((state) => state.decks)
  const run = useAppStore((state) => state.run)

  const [strategy, setStrategy] = useState<DeckStrategy>('balanced')
  const [deckName, setDeckName] = useState('')

  const candidates = useMemo(
    () =>
      generateBuildableCombos({
        parts,
        rules,
        lots,
        combos,
        mode: 'owned',
        sortBy: 'beginner',
        // 官方規則要求三套之間零件完全不重複，候選太少會排不出隊伍。
        limit: 60,
      }),
    [parts, rules, lots, combos],
  )

  const suggestions = useMemo(
    () =>
      suggestDecks({
        candidates,
        parts,
        lots,
        combos,
        ruleSet: DEFAULT_DECK_RULES,
        strategy,
        limit: 3,
      }),
    [candidates, parts, lots, combos, strategy],
  )

  const savedComboDecks = useMemo(
    () =>
      decks.map((deck) => {
        const slotsList = deck.comboIds
          .map((id) => combos.find((combo) => combo.id === id)?.slots)
          .filter((slots): slots is NonNullable<typeof slots> => Boolean(slots))
        return {
          deck,
          validation: validateDeck({
            slotsList,
            parts,
            rules,
            lots,
            combos,
            ruleSet: DEFAULT_DECK_RULES,
          }),
        }
      }),
    [decks, combos, parts, rules, lots],
  )

  return (
    <>
      <PageHeader
        title="3on3 組隊"
        description="用現有可用零件排出三顆一組，會檢查庫存、相容性與重複零件限制。"
      />

      <NoticeCard tone={DEFAULT_DECK_RULES.provenance.verificationStatus === 'official_verified' ? 'accent' : 'warn'}>
        {DEFAULT_DECK_RULES.summaryZhTW}
        {DEFAULT_DECK_RULES.provenance.sourceUrls[0] ? (
          <>
            {' '}
            <a href={DEFAULT_DECK_RULES.provenance.sourceUrls[0]} target="_blank" rel="noreferrer">
              官方規章
            </a>
          </>
        ) : null}
      </NoticeCard>

      <div className="work-split">
      <div className="stack">
      <Section title="推薦模式">
        <select
          className="field"
          aria-label="推薦模式"
          value={strategy}
          onChange={(event) => setStrategy(event.target.value as DeckStrategy)}
        >
          {(Object.keys(DECK_STRATEGY_ZH) as DeckStrategy[]).map((key) => (
            <option key={key} value={key}>
              {DECK_STRATEGY_ZH[key]}
            </option>
          ))}
        </select>
      </Section>

      </div>

      <div className="work-result">
      <Section title="建議隊伍" action={<EstimateBadge />}>
        {candidates.length < DEFAULT_DECK_RULES.teamSize ? (
          <EmptyState
            testId="deck-not-enough-candidates"
            title="可組配置不足 3 套"
            hint="先到「商品」或「零件」把庫存登記齊，至少要能組出 3 套不同上蓋的配置。"
          />
        ) : suggestions.length === 0 ? (
          <EmptyState
            testId="deck-no-valid"
            title="現有零件排不出合法隊伍"
            hint="可能是上蓋重複或某個零件不夠用。"
          />
        ) : (
          <div className="stack">
            {suggestions.map((suggestion, index) => (
              <div className="card" data-testid="deck-suggestion" key={`${suggestion.strategy}-${index}`}>
                <Row>
                  <strong style={{ flex: 1 }}>
                    {suggestion.strategyZhTW} 建議 {index + 1}
                  </strong>
                  <Badge tone="ok">可實際組出</Badge>
                </Row>
                <div className="stack" style={{ marginTop: 8 }}>
                  {suggestion.validation.members.map((member) => (
                    <div
                      className="deck-member"
                      key={`${member.roleZhTW}-${member.analysis.fullCode}`}
                    >
                      <div>
                        <Badge tone="accent">{member.roleZhTW}</Badge>{' '}
                        {member.analysis.fullNameZhTW}
                      </div>
                      <div className="meta">{member.reasonZhTW}</div>
                    </div>
                  ))}
                </div>
                {suggestion.validation.warningsZhTW.length > 0 ? (
                  <ul
                    style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--warn)', fontSize: 13 }}
                  >
                    {suggestion.validation.warningsZhTW.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="meta" style={{ marginTop: 8 }}>
                  占用零件：{describeParts(suggestion.validation.occupiedPartIds, parts)}
                </div>
                {suggestion.alternativesZhTW.length > 0 ? (
                  <div className="meta">{suggestion.alternativesZhTW.join('；')}</div>
                ) : null}
                <div style={{ height: 8 }} />
                <Row>
                  <input
                    className="field"
                    style={{ flex: 1, minWidth: 140 }}
                    placeholder="隊伍名稱"
                    aria-label="隊伍名稱"
                    value={deckName}
                    onChange={(event) => setDeckName(event.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={deckName.trim().length === 0}
                    onClick={async () => {
                      const comboIds: string[] = []
                      for (const member of suggestion.validation.members) {
                        const id = await repo.saveCombo({
                          nameZhTW: `${deckName.trim()}－${member.roleZhTW}`,
                          system: member.analysis.system,
                          slots: member.slots,
                          favorite: false,
                          physicallyBuilt: false,
                          roleZhTW: member.roleZhTW,
                        })
                        comboIds.push(id)
                      }
                      await run(() => repo.saveDeck({ nameZhTW: deckName.trim(), comboIds }))
                      setDeckName('')
                    }}
                  >
                    存成我的 3on3
                  </button>
                </Row>
              </div>
            ))}
          </div>
        )}
      </Section>
      </div>
      </div>

      <Section title="我的 3on3">
        {savedComboDecks.length === 0 ? (
          <EmptyState title="還沒有儲存隊伍" />
        ) : (
          <div className="list-grid">
            {savedComboDecks.map(({ deck, validation }) => (
              <div className="card" key={deck.id}>
                <Row>
                  <strong style={{ flex: 1 }}>{deck.nameZhTW}</strong>
                  {validation.ok ? (
                    <Badge tone="ok">可實際組出</Badge>
                  ) : (
                    <Badge tone="danger">目前不可組</Badge>
                  )}
                </Row>
                <div className="stack" style={{ marginTop: 6, gap: 4 }}>
                  {validation.members.map((member) => (
                    <div key={member.analysis.fullCode}>
                      <Badge tone="accent">{member.roleZhTW}</Badge> {member.analysis.fullNameZhTW}
                    </div>
                  ))}
                </div>
                {validation.errorsZhTW.length > 0 ? (
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--danger)', fontSize: 13 }}>
                    {validation.errorsZhTW.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                ) : null}
                <div style={{ height: 8 }} />
                <Row>
                  <Link to="/compare" className="btn">
                    比較配裝
                  </Link>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => void run(() => repo.deleteDeck(deck.id))}
                  >
                    刪除隊伍
                  </button>
                </Row>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  )
}

function describeParts(partIds: string[], parts: { id: string; naming: { primaryZhTW: string } }[]): string {
  return partIds
    .map((id) => {
      const part = parts.find((row) => row.id === id)
      return part ? resolveDisplayName(part.naming).titleZhTW : id
    })
    .join('、')
}
