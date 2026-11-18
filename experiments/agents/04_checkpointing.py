from typing import TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

class AgentState(TypedDict):
    question: str
    attempts: int


def increment_attempts(state: AgentState) -> dict:
    attempts = state["attempts"]
    attempts += 1
    return {
        "attempts": attempts
    }

builder = StateGraph(AgentState)

builder.add_node("increment_attempts", increment_attempts)
builder.add_edge(START, "increment_attempts")
builder.add_edge("increment_attempts", END)


checkpointer = InMemorySaver()
graph = builder.compile(checkpointer=checkpointer)

config = {
    "configurable": {
        "thread_id": "research-session-001"
    }
}
new_config = {
    "configurable": {
        "thread_id": "research-session-002"
    }
}


result1 = graph.invoke({
    "question": "Find papers on RAG",
    "attempts": 0
}, config=config)
print("Result 1:", result1)

result2 = graph.invoke({
    "question": "Find more papers"
}, config=config)
print("Result 2:", result2)

result3 = graph.invoke(
    {"question": "Find papers about transformers", "attempts": 0},
    config=new_config
)
print("Result 3:", result3)

result4 = graph.invoke(
    {"question": "Find more papers"},
    config=config
)
print("Result 4:", result4)


snapshot = graph.get_state(config)
print("Checkpoint state:", snapshot.values)