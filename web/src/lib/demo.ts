/**
 * A demonstração pública é o mesmo aplicativo, compilado em outro modo: o
 * servidor roda dentro do navegador e os dados são fictícios.
 */
export const IS_DEMO = import.meta.env.MODE === 'demo'

/** Onde o aplicativo mora dentro do site da demonstração; a raiz fica com a apresentação do projeto. */
export const DEMO_APP_BASE = `${import.meta.env.BASE_URL}app`

export const REPOSITORY_URL = 'https://github.com/catmaitachi/financeiro'
