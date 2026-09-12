/** 扩展开关：支持环境变量或命令行参数（Windows cmd 友好） */
export const PANTHEON = process.env.PANTHEON === '1' || process.argv.includes('--pantheon');
export const AGORA = process.env.AGORA === '1' || process.argv.includes('--agora');
