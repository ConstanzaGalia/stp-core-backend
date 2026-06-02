import { Exercise } from 'src/entities/excercise.entity';

export type ExerciseWithAccess = Exercise & {
  canEdit: boolean;
  isShared: boolean;
};
