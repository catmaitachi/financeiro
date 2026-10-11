import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { BankSummary, Dashboard } from "@shared/api";
import { addMonths, type Month } from "@shared/months";
import { duration, ease, popoverVariants } from "@/design/motion";
import { BankLogo } from "@/features/banks/BankLogo";
import type { BankTones } from "@/features/banks/tones";
import { cn } from "@/lib/cn";
import { formatBRL, formatMonth, formatMonthShort } from "@/lib/format";
import { IconButton } from "@/ui/Button";
import { Panel } from "@/ui/Panel";
import { Segmented } from "@/ui/Segmented";

interface BillYearProps {
  year: Dashboard["billYear"];
  banks: BankSummary[];
  selected: Month;
  currentMonth: Month;
  tones: BankTones;
  onSelect: (month: Month) => void;
}

/** Altura mínima da área das colunas; em telas largas ela cresce até o fim do painel. */
const PLOT_MIN_HEIGHT = 168;

/**
 * As faturas do ano, mês a mês, empilhadas por banco. É também o seletor do
 * mês que o resumo por categoria mostra. Os meses à frente trazem só o que já
 * está lançado (parcelas), então crescem até a fatura fechar.
 */
export function BillYear({
  year,
  banks,
  selected,
  currentMonth,
  tones,
  onSelect,
}: BillYearProps) {
  const [hovered, setHovered] = useState<Month | null>(null);
  const scale = Math.max(1, ...year.map((entry) => entry.totalCents));
  const focus = hovered ?? selected;
  const active = year.find((entry) => entry.month === focus);
  const activeIndex = year.findIndex((entry) => entry.month === focus);
  const bankOf = new Map(banks.map((entry) => [entry.bank.id, entry.bank]));
  const legend = banks
    .filter((entry) => entry.cards.length > 0)
    .sort((a, b) => a.bank.id.localeCompare(b.bank.id));
  const label = selected.slice(0, 4);

  return (
    <Panel className="relative flex h-full flex-col pb-4">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 className="text-lg text-text">Faturas em {label}</h2>
        <div className="flex items-center gap-4">
          <ul
            className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-2"
            aria-label="Legenda"
          >
            {legend.map((entry) => (
              <li key={entry.bank.id} className="flex items-center gap-2">
                <span
                  className={cn("size-2.5 rounded-[3px]", tones(entry.bank.id))}
                  aria-hidden="true"
                />
                {entry.bank.name}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-1">
            <IconButton
              label="Ano anterior"
              size="sm"
              variant="quiet"
              onClick={() => onSelect(addMonths(selected, -12))}
            >
              <CaretLeftIcon size={16} weight="bold" />
            </IconButton>
            <IconButton
              label="Ano seguinte"
              size="sm"
              variant="quiet"
              onClick={() => onSelect(addMonths(selected, 12))}
            >
              <CaretRightIcon size={16} weight="bold" />
            </IconButton>
          </div>
        </div>
      </header>

      <div className="relative flex flex-1 flex-col">
        {/* Leitura do mês sob o ponteiro: o total e a parte de cada banco. */}
        <AnimatePresence>
          {hovered && active ? (
            <motion.div
              key="readout"
              variants={popoverVariants}
              initial="initial"
              animate="enter"
              exit="exit"
              className="surface-raised pointer-events-none absolute bottom-full z-(--z-nav) mb-1 w-56 rounded-md px-3 py-2"
              style={{
                left: `clamp(0px, calc(${((activeIndex + 0.5) / year.length) * 100}% - 7rem), calc(100% - 14rem))`,
              }}
            >
              <p className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-text-3">
                  {formatMonth(active.month)}
                  {active.month > currentMonth ? ", até agora" : ""}
                </span>
                <span className="tabular text-sm font-semibold text-text">
                  {formatBRL(active.totalCents)}
                </span>
              </p>
              {active.byBank.map((share) => {
                const bank = bankOf.get(share.bankId);
                return bank ? (
                  <p
                    key={share.bankId}
                    className="mt-1.5 flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-text-2">
                      <BankLogo bank={bank} size="sm" className="size-4" />
                      <span className="truncate">{bank.name}</span>
                    </span>
                    <span className="tabular text-text">
                      {formatBRL(share.cents)}
                    </span>
                  </p>
                ) : null;
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div
          className="grid flex-1 items-end border-b border-edge px-1 pt-2"
          style={{
            gridTemplateColumns: `repeat(${year.length}, minmax(0, 1fr))`,
            minHeight: PLOT_MIN_HEIGHT,
          }}
          onPointerLeave={() => setHovered(null)}
        >
          {year.map((entry) => {
            const emphasized =
              entry.month === selected || entry.month === hovered;
            const segments = [...entry.byBank]
              .filter((share) => share.cents > 0)
              .sort((a, b) => b.bankId.localeCompare(a.bankId));
            return (
              <button
                key={entry.month}
                type="button"
                tabIndex={-1}
                aria-hidden
                onClick={() => onSelect(entry.month)}
                onPointerEnter={() => setHovered(entry.month)}
                className="flex h-full cursor-pointer items-end justify-center"
              >
                <motion.span
                  className="flex w-4 flex-col gap-0.5 md:w-6"
                  initial={false}
                  animate={{
                    height: `${entry.totalCents > 0 ? Math.max(2, (entry.totalCents / scale) * 100) : 0}%`,
                    opacity: emphasized ? 1 : 0.62,
                  }}
                  transition={{ duration: duration.layout, ease: ease.out }}
                >
                  {segments.map((share, index) => (
                    <span
                      key={share.bankId}
                      className={cn(
                        "min-h-0.5",
                        index === 0 ? "rounded-t-[4px]" : "rounded-[1px]",
                        tones(share.bankId),
                      )}
                      style={{ flexGrow: share.cents, flexBasis: 0 }}
                    />
                  ))}
                </motion.span>
              </button>
            );
          })}
        </div>

        <Segmented
          label="Mês da fatura"
          size="sm"
          className="mt-2 border-transparent bg-transparent shadow-none [&_button]:px-0"
          options={year.map((entry) => ({
            value: entry.month,
            label: formatMonthShort(entry.month),
            shortLabel: formatMonthShort(entry.month).charAt(0).toUpperCase(),
          }))}
          value={selected}
          onChange={onSelect}
        />
        <p className="sr-only" aria-live="polite">
          {formatMonth(selected)}
          {selected === currentMonth ? ", mês atual" : ""}
        </p>
      </div>

      {/* Os mesmos números em tabela, para quem não lê o gráfico. */}
      <div className="sr-only">
        <table>
          <caption>Faturas de {label} por banco</caption>
          <thead>
            <tr>
              <th scope="col">Mês</th>
              {legend.map((entry) => (
                <th key={entry.bank.id} scope="col">
                  {entry.bank.name}
                </th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {year.map((entry) => (
              <tr key={entry.month}>
                <th scope="row">{formatMonth(entry.month)}</th>
                {legend.map((bank) => (
                  <td key={bank.bank.id}>
                    {formatBRL(
                      entry.byBank.find(
                        (share) => share.bankId === bank.bank.id,
                      )?.cents ?? 0,
                    )}
                  </td>
                ))}
                <td>{formatBRL(entry.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
