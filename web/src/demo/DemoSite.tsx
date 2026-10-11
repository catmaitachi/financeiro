import { AppFrame } from '@/app/App'
import { DEMO_APP_BASE } from '@/lib/demo'
import { DemoApp } from './DemoApp'
import { Landing } from './Landing'

/** O site da demonstração: a apresentação do projeto na raiz e o aplicativo em `app/`. */
export function DemoSite() {
  const inApp = window.location.pathname.startsWith(DEMO_APP_BASE)
  return <AppFrame>{inApp ? <DemoApp /> : <Landing />}</AppFrame>
}
