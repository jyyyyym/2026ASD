export type MediaFile = {
  id: string;
  url: string;
  name: string;
  mime: string;
};

export type Project = {
  id: string;
  slug: string;
  createdAt: string;
};

export type Submission = {
  id: string;
  projectId: string;
  author: string;
  aiName: string;
  promptProcess: string;
  content: string;
  intermediateImages: MediaFile[];
  finalImages: MediaFile[];
  videos: MediaFile[];
  createdAt: string;
};

export type Database = {
  projects: Project[];
  submissions: Submission[];
};
