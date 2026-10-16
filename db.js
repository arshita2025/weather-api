// import pg means postgre
import pg from "pg";
// basically it create the pool so reuseable database so by opening and closing every time not cause a error
export const pool = new pg.Pool({
  // it combines you database host ,password,username
  // it keep the database password secret provide the environment variable
  connectionString: process.env.DATABASE_URL,
  //   protecting the data from the hacker so nobody can access the private information
  ssl:
    // why this is use to convert the data into the encrypted form
    // basically process.env is used to store the secret variable NODE_ENV is used to check the project is in development mode or production mode
    // if yes then convert the data in the encrypt form otherwise false
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});
// create the table if not exist it as database
export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS weather_requests (
    id SERIAL PRIMARY KEY,
    city TEXT NOT NULL,
    resolved_location TEXT,
    source TEXT NOT NULL,
    temp NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now()
    )
    `);
}
// if exsist insert the data in this table
// ({ city, location, source, temp }) this is a object destructing in which if user search for one iitem itt will provide all the four
export function logRequest({ city, location, source, temp }) {
  return pool
    .query(
      "INSERT INTO weather_requests (city,resolved_location,source,temp)VALUES($1, $2, $3, $4)",
      [city, location, source, temp],
    )
    .catch((err) => console.error("db failed", err.message));
}
