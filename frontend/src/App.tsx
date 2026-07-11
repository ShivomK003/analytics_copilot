import { useMetrics } from "./hooks/useMetrics";

function App() {
  const data = useMetrics();

  if (!data) {
    return <h1>Loading...</h1>;
  }

  return (
    <div style={{ padding: "2rem" }}>
      <h1>AI Research Intelligence Copilot</h1>

      <h2>Overview</h2>

      <p>Total Papers: {data.total_papers}</p>

      <h3>Top Topics</h3>

      <ul>
        {data.top_topics.map((topic: any) => (
          <li key={topic.topic_name}>
            {topic.topic_name} ({topic.paper_count})
          </li>
        ))}
      </ul>

      <h3>Latest Papers</h3>

      <ul>
        {data.latest_papers.map((paper: any) => (
          <li key={paper.arxiv_url}>
            {paper.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;