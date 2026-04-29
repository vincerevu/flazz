CREATE TABLE "memory_graph_processed_files" (
    "file_path" TEXT NOT NULL PRIMARY KEY,
    "mtime" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "last_processed" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "memory_graph_meta" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);
