-- Optimized indexes for JSONB filtering on Resume.parsedData
-- Run this after prisma db push to add GIN indexes that Prisma cannot define natively.

-- GIN index on parsedData for @> (contains) and @? (jsonpath) operations
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Resume_parsedData_gin"
  ON "Resume" USING GIN ("parsedData" jsonb_path_ops);

-- Partial expression index: extract skills array for fast skill lookups
-- (covers both array-type and object-type skills)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Resume_parsedData_skills_gin"
  ON "Resume" USING GIN (("parsedData"->'skills'));

-- Expression index for education array element lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Resume_parsedData_education_gin"
  ON "Resume" USING GIN (("parsedData"->'education'));

-- Expression index for experience array element lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Resume_parsedData_experience_gin"
  ON "Resume" USING GIN (("parsedData"->'experience'));
