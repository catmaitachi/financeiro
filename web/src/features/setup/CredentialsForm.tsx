import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import type { SetupStatus } from '@shared/api'
import { collapseVariants } from '@/design/motion'
import { api, ApiError } from '@/lib/api'
import { keys, queryClient } from '@/lib/query'
import { Button, IconButton } from '@/ui/Button'
import { TextField } from '@/ui/Field'

interface CredentialsFormProps {
  submitLabel?: string
  onSaved: (status: SetupStatus) => void
  onCancel?: () => void
}

/**
 * Cadastro das credenciais da Pluggy. O servidor valida o par antes de guardar
 * no cofre; daqui os valores só saem para o servidor local, uma única vez.
 */
export function CredentialsForm({ submitLabel = 'Testar e salvar', onSaved, onCancel }: CredentialsFormProps) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [reveal, setReveal] = useState(false)

  const save = useMutation({
    mutationFn: api.setup.save,
    onSuccess: (status) => {
      queryClient.setQueryData(keys.setup, status)
      setClientId('')
      setClientSecret('')
      onSaved(status)
    },
  })

  const error = save.error instanceof ApiError ? save.error : null
  const fieldError = (code: string) => (error?.code === code ? error.message : null)
  const generalError = error && !['invalid_client_id', 'invalid_client_secret'].includes(error.code) ? error.message : null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate({ clientId, clientSecret })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <TextField
        label="Client ID"
        name="clientId"
        value={clientId}
        onChange={(event) => setClientId(event.target.value)}
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        required
        error={fieldError('invalid_client_id')}
        data-autofocus
      />
      <TextField
        label="Client Secret"
        name="clientSecret"
        type={reveal ? 'text' : 'password'}
        value={clientSecret}
        onChange={(event) => setClientSecret(event.target.value)}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        required
        error={fieldError('invalid_client_secret')}
        trailing={
          <IconButton
            label={reveal ? 'Ocultar Client Secret' : 'Mostrar Client Secret'}
            size="sm"
            aria-pressed={reveal}
            onClick={() => setReveal((value) => !value)}
          >
            {reveal ? <EyeSlashIcon /> : <EyeIcon />}
          </IconButton>
        }
      />

      <AnimatePresence initial={false}>
        {generalError ? (
          <motion.p
            key={generalError}
            role="alert"
            variants={collapseVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className="overflow-hidden text-sm text-negative"
          >
            {generalError}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" loading={save.isPending} disabled={!clientId.trim() || !clientSecret.trim()}>
          {save.isPending ? 'Validando com a Pluggy' : submitLabel}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel} disabled={save.isPending}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  )
}
