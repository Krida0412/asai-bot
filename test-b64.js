import { URL } from "url";
const p = "/api/storage/file?key=uploads%2F3a36c858-dec7-4518-9413-c0c584bc76c4-test_foto.jpg";
const url = new URL(p, "http://localhost");
console.log(url.searchParams.get("key"));
