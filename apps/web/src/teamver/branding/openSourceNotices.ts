export type TeamverOpenSourceNotice = {
  id: string;
  name: string;
  copyright: string;
  license: string;
  licenseUrl: string;
  sourceUrl?: string;
};

/** SSOT for Settings → About open-source attribution in Teamver embed. */
export const TEAMVER_OPEN_SOURCE_NOTICES: readonly TeamverOpenSourceNotice[] = [
  {
    id: "open-design",
    name: "Open Design",
    copyright: "Copyright 2026 Open Design contributors",
    license: "Apache License 2.0",
    licenseUrl: "https://www.apache.org/licenses/LICENSE-2.0",
    sourceUrl: "https://github.com/nexu-io/open-design",
  },
  {
    id: "guizang-ppt",
    name: "guizang-ppt design template",
    copyright: "Copyright (c) op7418",
    license: "MIT License",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    id: "html-ppt",
    name: "html-ppt design template",
    copyright: "Copyright (c) lewislulu",
    license: "MIT License",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
] as const;
