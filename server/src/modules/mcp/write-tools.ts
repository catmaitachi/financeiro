import { z } from 'zod'
import { monthSchema, uuidSchema } from '../../platform/http/validate.ts'
import type { McpPorts } from './ports.ts'
import { defineTool, type McpTool } from './tool.ts'

/** Nenhuma apaga dados. Excluir previsões, conexões e credenciais não é oferecido aos agentes. */
const ADDS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const
const CHANGES = { readOnlyHint: false, destructiveHint: true, idempotentHint: true } as const
/** Decisão sobre um vínculo: sobrescreve o estado e não se repete (a segunda chamada é recusada). */
const DECIDES = { readOnlyHint: false, destructiveHint: true, idempotentHint: false } as const

const idSchema = z.number().int().positive()

/** Ferramentas que alteram dados. Só entram na lista com o interruptor de escrita ligado. */
export function writeTools({ ledger, forecasts, reconciliation, sync }: McpPorts): McpTool[] {
  return [
    defineTool({
      name: 'sincronizar',
      title: 'Sincronizar com os bancos',
      description:
        'Busca lançamentos novos nos bancos conectados e reavalia as conciliações. Não apaga nada e pode demorar alguns segundos. ' +
        'Se já houver uma sincronização em andamento, devolve o estado dela.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      run: () => sync.run({ trigger: 'manual' }),
    }),

    defineTool({
      name: 'criar_previsao',
      title: 'Criar previsão',
      description:
        'Cria uma previsão de caixa. A expressão aceita: 300 (entrada de R$ 300,00), -300 (saída), 300*3 (três competências de R$ 300,00), ' +
        '900/3 (R$ 900,00 divididos em três) e 300! (R$ 300,00 todo mês, sem fim). Valores aceitam o formato brasileiro (1.200,50). ' +
        'Devolve a previsão criada, com as ocorrências de cada mês.',
      inputSchema: z.object({
        expressao: z.string().min(1, 'Informe o valor da previsão.').max(40).describe('Por exemplo -300, 900/3 ou 89,90!.'),
        nome: z.string().max(80).nullable().optional().describe('Nome da previsão, como "Seguro do carro".'),
        mes_inicial: monthSchema.optional().describe('Primeiro mês, AAAA-MM. Padrão: o mês inicial sugerido em listar_previsoes.'),
      }),
      annotations: ADDS,
      run: ({ expressao, nome, mes_inicial }) => {
        const created = forecasts.create({ expression: expressao, name: nome, startMonth: mes_inicial })
        // Uma previsão nova pode já ter lançamentos que a cumprem.
        reconciliation.reconcile()
        return forecasts.series(created.id)
      },
    }),

    defineTool({
      name: 'recategorizar_transacao',
      title: 'Recategorizar transação',
      description:
        'Corrige localmente a categoria de um lançamento e/ou se ele entra nos totais. Não altera o banco: é uma correção do app. ' +
        'Use null em "categoria" para voltar à categoria original e null em "incluir_nos_totais" para voltar à regra automática.',
      inputSchema: z
        .object({
          transacao: uuidSchema.describe('Identificador do lançamento, como em listar_transacoes.'),
          categoria: z.string().max(32).nullable().optional().describe('Identificador da categoria, como em listar_categorias.'),
          incluir_nos_totais: z.boolean().nullable().optional(),
        })
        .refine((value) => value.categoria !== undefined || value.incluir_nos_totais !== undefined, 'Nada para alterar.'),
      annotations: CHANGES,
      run: ({ transacao, categoria, incluir_nos_totais }) => {
        ledger.setOverride(transacao, { categoryId: categoria, includeInTotals: incluir_nos_totais })
        return { ok: true }
      },
    }),

    defineTool({
      name: 'confirmar_conciliacao',
      title: 'Confirmar conciliação',
      description: 'Aceita uma sugestão de vínculo entre previsão e lançamento (veja fila_de_conciliacao). A previsão passa a realizada.',
      inputSchema: z.object({ vinculo: idSchema.describe('Identificador do vínculo sugerido.') }),
      annotations: DECIDES,
      run: ({ vinculo }) => {
        reconciliation.confirm(vinculo)
        return { ok: true }
      },
    }),

    defineTool({
      name: 'rejeitar_conciliacao',
      title: 'Rejeitar conciliação',
      description: 'Recusa uma sugestão de vínculo. O par não será sugerido de novo.',
      inputSchema: z.object({ vinculo: idSchema.describe('Identificador do vínculo sugerido.') }),
      annotations: DECIDES,
      run: ({ vinculo }) => {
        reconciliation.reject(vinculo)
        return { ok: true }
      },
    }),

    defineTool({
      name: 'desfazer_conciliacao',
      title: 'Desfazer conciliação',
      description: 'Desfaz um vínculo já confirmado. O par fica registrado como recusado e não será refeito sozinho.',
      inputSchema: z.object({ vinculo: idSchema.describe('Identificador do vínculo confirmado.') }),
      annotations: DECIDES,
      run: ({ vinculo }) => {
        reconciliation.undo(vinculo)
        return { ok: true }
      },
    }),

    defineTool({
      name: 'definir_status_da_ocorrencia',
      title: 'Definir status da ocorrência',
      description:
        'Marca à mão o estado de uma ocorrência de previsão: expected (esperada), received_manual (realizada) ou ignored (ignorada). ' +
        'Os identificadores de ocorrência vêm de listar_previsoes.',
      inputSchema: z.object({
        ocorrencia: idSchema,
        status: z.enum(['expected', 'received_manual', 'ignored']),
      }),
      annotations: CHANGES,
      run: ({ ocorrencia, status }) => {
        forecasts.setManualStatus(ocorrencia, status)
        reconciliation.reconcile()
        return { ok: true }
      },
    }),
  ]
}
