export type InputType = 'single_select' | 'multi_select' | 'ranking';

export interface InteractiveQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface InteractiveInput {
  message: string;
  type: InputType;
  questions: InteractiveQuestion[];
}

export interface InteractiveState {
  data: InteractiveInput | null;
  answered: boolean;
  selectedAnswers: Record<string, string | string[]>;
}
