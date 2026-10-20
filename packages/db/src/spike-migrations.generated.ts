export const spikeMigrations = [
  {
    "id": "0000",
    "name": "0000_freezing_thanos.sql",
    "hash": "05735de7759bb32ab919a9f728cbe27619b4389749fcfaa6e61b8cb5cd8be67f",
    "sql": "CREATE TABLE \"spike_items\" (\n\t\"id\" uuid PRIMARY KEY NOT NULL,\n\t\"label\" text NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n"
  }
] as const;
