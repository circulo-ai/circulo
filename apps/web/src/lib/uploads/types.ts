/**
 * User-facing file object with simplified interface
 */
export interface UserFile {
  id: string;
  name: string;
  url: string;
  size: number;
  type: string;
  key: string;
  context?: string;
}
