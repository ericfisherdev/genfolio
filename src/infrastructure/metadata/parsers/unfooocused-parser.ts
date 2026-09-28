import type { GenerationParser, ParsedGeneration } from '@domain/generation'
import { GenerationFormat, GeneratorKind } from '@shared/generation-kinds'
import { parseInteger } from './values'

const STEPS_LINE = /^Steps:\s*(\d+)$/

/**
 * UnFooocused writes `<prompt>\nSteps: <n>` (PNG `parameters`, EXIF ImageDescription). A1111
 * would read all of it as prompt, since the last line has only one pair.
 */
export class UnFooocusedParser implements GenerationParser {
  readonly format = GenerationFormat.UnFooocusedText

  parse(text: string): ParsedGeneration | undefined {
    const lines = text.trim().split('\n')
    const steps = STEPS_LINE.exec(lines.pop()?.trim() ?? '')?.[1]
    const prompt = lines.join('\n').trim()
    if (steps === undefined || prompt === '') return undefined
    const parsedSteps = parseInteger(steps)
    return {
      generator: GeneratorKind.UnFooocused,
      prompt,
      ...(parsedSteps === undefined ? {} : { steps: parsedSteps }),
      params: { Steps: steps }
    }
  }
}
