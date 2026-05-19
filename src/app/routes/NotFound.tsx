import { link } from "../base";

export default function NotFound() {
  return (
    <section class="route route-notfound">
      <h1>Page not found</h1>
      <p>That route doesn't exist. <a href={link("/")}>Back to Dashboard</a>.</p>
    </section>
  );
}
