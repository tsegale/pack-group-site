// Scroll reveal
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        observer.unobserve(e.target);
      }
    });
  },
  { threshold: 0.1 },
);
document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

// Hamburger
const ham = document.getElementById("ham");
const navlinks = document.getElementById("navlinks");
if (ham && navlinks) {
  ham.addEventListener("click", () => navlinks.classList.toggle("open"));
}
