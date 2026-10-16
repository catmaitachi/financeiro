import { z } from 'zod'
import { dateSchema, daySchema, monthSchema, uuidSchema } from '../../platform/http/validate.ts'
import { addDays } from '../../../../shared/days.ts'
import { todayLocal } from '../../platform/time.ts'
import type { McpPorts } from './ports.ts'
import { defineTool, type McpTool } from './tool.ts'

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const

const MONEY_NOTE =
  'Valores monetários vêm em centavos inteiros (R$ 12,34 = 1234). Datas civis no fuso de São Paulo.'

/** Ferramentas que só consultam. Ficam sempre disponíveis. */
export function readTools({
  ledger,
  dashboard,
  forecasts,
  reconciliation,
  subscriptions,
  calendar,
  sync,
  connections,
  clock,
}: McpPorts): McpTool[] {
  return [
    defineTool({
      name: 'resumo_do_mes',
      title: 'Resumo do mês',
      description:
        'Painel financeiro de um mês: saldo das contas, entradas, saídas, faturas de cartão, previsões e pendências de conciliação. ' +
        `Sem "mes", usa o mês em foco: o corrente ou, quando todas as faturas dele já estão pagas, o seguinte. ${MONEY_NOTE}`,
      inputSchema: z.object({
        mes: monthSchema.optional().describe('Mês no formato AAAA-MM. Padrão: mês em foco.'),
        ate_mes: monthSchema.optional().describe('Último mês da janela de projeção, AAAA-MM.'),
      }),
      annotations: READ_ONLY,
      run: ({ mes, ate_mes }) => dashboard.build(mes, ate_mes),
    }),

    defineTool({
      name: 'listar_contas',
      title: 'Listar contas e cartões',
      description: `Contas correntes e cartões de crédito conectados, com saldo e limite. ${MONEY_NOTE}`,
      inputSchema: z.object({}),
      annotations: READ_ONLY,
      run: () => ({ contas: ledger.listAccounts() }),
    }),

    defineTool({
      name: 'listar_transacoes',
      title: 'Listar transações',
      description:
        'Lançamentos de contas e cartões, do mais recente para o mais antigo, paginados. Combine os filtros para responder perguntas como ' +
        '"quanto gastei com restaurantes em outubro?". O retorno traz também os totais de entradas e saídas do filtro inteiro, não só da página. ' +
        'Sem período (mes, de ou ate), a lista para em hoje: parcelas futuras de cartão só entram com incluir_futuros ou com um período que as alcance. ' +
        `${MONEY_NOTE}`,
      inputSchema: z.object({
        busca: z.string().max(120).optional().describe(
            'Palavras que precisam bater todas, cada uma com a descrição, o valor (44,90, R$ 1.234,56 ou 44 para R$ 44,00 a R$ 44,99), ' +
              'a data (12/09, 12/09/2026 ou 09/2026) ou a conta (nubank ou o número dela).',
          ),
        mes: monthSchema.optional().describe('Mês AAAA-MM. Em cartões vale o mês da fatura; em contas, o mês da data.'),
        de: dateSchema.optional().describe('Data inicial, AAAA-MM-DD.'),
        ate: dateSchema.optional().describe('Data final, AAAA-MM-DD.'),
        banco: z.string().max(48).optional().describe('Identificador do banco, como em listar_contas.'),
        tipo_de_conta: z.enum(['BANK', 'CREDIT']).optional().describe('BANK para contas, CREDIT para cartões.'),
        conta: uuidSchema.optional().describe('Identificador de uma conta ou cartão.'),
        categoria: z.string().max(32).optional().describe('Identificador de categoria, como em listar_categorias. Inclui as subcategorias.'),
        direcao: z.enum(['in', 'out']).optional().describe('in para entradas, out para saídas.'),
        situacao: z.enum(['POSTED', 'PENDING']).optional().describe('POSTED para lançadas, PENDING para pendentes.'),
        sem_fatura_identificada: z.boolean().optional().describe('Só lançamentos de cartão sem fatura identificada.'),
        incluir_futuros: z.boolean().optional().describe('Inclui lançamentos com data depois de hoje quando nenhum período é informado.'),
        pagina: z.number().int().positive().optional(),
        tamanho_da_pagina: z.number().int().positive().optional().describe('O servidor aplica um teto.'),
      }),
      annotations: READ_ONLY,
      run: (input) => {
        // Mesma regra da tela de transações: parcelas futuras empurrariam para baixo o que já aconteceu.
        const hasPeriod = Boolean(input.mes || input.de || input.ate)
        return ledger.listTransactions({
          q: input.busca,
          month: input.mes,
          from: input.de,
          to: input.ate ?? (hasPeriod || input.incluir_futuros ? undefined : todayLocal(clock)),
          bankId: input.banco,
          accountType: input.tipo_de_conta,
          accountId: input.conta,
          categoryId: input.categoria,
          direction: input.direcao,
          status: input.situacao,
          unidentified: input.sem_fatura_identificada,
          page: input.pagina,
          pageSize: input.tamanho_da_pagina,
        })
      },
    }),

    defineTool({
      name: 'listar_categorias',
      title: 'Listar categorias',
      description: 'Categorias de lançamentos, com a hierarquia (categoria pai e subcategorias). Os identificadores servem de filtro em listar_transacoes.',
      inputSchema: z.object({}),
      annotations: READ_ONLY,
      run: () => ({ categorias: ledger.listCategories() }),
    }),

    defineTool({
      name: 'listar_previsoes',
      title: 'Listar previsões',
      description:
        'Previsões de entradas e saídas (únicas e recorrentes; mensais, semanais ou diárias) com suas ocorrências, ' +
        `o dia de cada uma quando houver e o estado. ${MONEY_NOTE}`,
      inputSchema: z.object({}),
      annotations: READ_ONLY,
      run: () => ({ previsoes: forecasts.list(), mes_inicial_padrao: forecasts.defaultStartMonth() }),
    }),

    defineTool({
      name: 'listar_assinaturas',
      title: 'Listar assinaturas',
      description:
        'Assinaturas encontradas nas cobranças recorrentes: as confirmadas pelo usuário e as sugeridas que esperam confirmação, ' +
        `com cadência, valor, próxima cobrança, conta e cobranças vinculadas. Inclui o custo mensal das ativas. ${MONEY_NOTE}`,
      inputSchema: z.object({}),
      annotations: READ_ONLY,
      run: () => subscriptions.list(),
    }),

    defineTool({
      name: 'listar_calendario',
      title: 'Listar calendário',
      description:
        'O que acontece em cada dia de um intervalo: fechamento e vencimento de faturas, cobranças de assinaturas confirmadas ' +
        `(feitas e esperadas) e previsões com dia. Intervalo de até 92 dias; padrão: os próximos 30 dias. ${MONEY_NOTE}`,
      inputSchema: z.object({
        de: daySchema.optional().describe('Primeiro dia, AAAA-MM-DD. Padrão: hoje.'),
        ate: daySchema.optional().describe('Último dia, AAAA-MM-DD. Padrão: 29 dias depois do primeiro.'),
      }),
      annotations: READ_ONLY,
      run: ({ de, ate }) => {
        const from = de ?? todayLocal(clock)
        return calendar.events(from, ate ?? addDays(from, 29))
      },
    }),

    defineTool({
      name: 'fila_de_conciliacao',
      title: 'Fila de conciliação',
      description: 'Vínculos sugeridos entre previsões e lançamentos reais que esperam confirmação.',
      inputSchema: z.object({}),
      annotations: READ_ONLY,
      run: () => reconciliation.queue(),
    }),

    defineTool({
      name: 'estado_da_sincronizacao',
      title: 'Estado da sincronização',
      description: 'Se há uma sincronização com os bancos em andamento e o resultado da última execução.',
      inputSchema: z.object({}),
      annotations: READ_ONLY,
      run: () => sync.state(),
    }),

    defineTool({
      name: 'listar_conexoes',
      title: 'Listar conexões',
      description: 'Bancos conectados, com a saúde de cada conexão, a data da última sincronização e o último erro, se houver.',
      inputSchema: z.object({}),
      annotations: READ_ONLY,
      run: () => ({ conexoes: connections.list() }),
    }),
  ]
}
