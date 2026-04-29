CREATE TABLE "email_labeling_files" (
    "path" TEXT NOT NULL PRIMARY KEY,
    "labeled_at" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "email_labeling_state" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "last_run_time" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);
