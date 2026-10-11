/**
 * Mês da fatura de um lançamento, como expressão SQL sobre `ledger_entries e`.
 *
 * Vale a competência gravada na sincronização. Quando o banco ainda não
 * entregou a fatura, a compra de cartão chega sem competência; mas uma compra
 * feita depois do fechamento da última fatura conhecida só pode estar na
 * seguinte. É o ciclo do próprio cartão, não um palpite pelo mês da compra, e
 * só a última fatura serve de referência. Fora desse caso, o resultado é NULL
 * ("Fatura não identificada").
 */
export const BILL_MONTH = `COALESCE(e.competence_month, (
    SELECT CASE
             WHEN e.local_date > date(COALESCE(b.closing_date, b.due_date), '+1 month')
               THEN strftime('%Y-%m', b.due_date, 'start of month', '+2 months')
             WHEN e.local_date > COALESCE(b.closing_date, b.due_date)
               THEN strftime('%Y-%m', b.due_date, 'start of month', '+1 month')
           END
      FROM bills b
     WHERE e.account_type = 'CREDIT' AND b.account_id = e.account_id AND b.currency_code = 'BRL'
     ORDER BY b.due_date DESC LIMIT 1))`
