/**
 * The data behind a Student's Lesson page: the course and its curriculum,
 * progress and watch position, the Discussion thread, and the quiz.
 * The Note editor's state lives in `~/modules/lesson-note`.
 */
export {
  flattenCourseLessons,
  getCourseWithDetails,
  getLessonById,
  getModuleById,
  getUserById,
} from "./lib/course";
export {
  calculateWatchProgress,
  getLastWatchPosition,
  getLessonProgress,
  getLessonProgressForCourse,
  markLessonComplete,
  markLessonInProgress,
} from "./lib/progress";
export { getCommentById, getLessonThread, renderThread } from "./lib/thread";
export {
  computeResult,
  getBestAttempt,
  getQuizByLessonId,
  getQuizWithQuestions,
  isQuizOnLesson,
} from "./lib/quiz";
