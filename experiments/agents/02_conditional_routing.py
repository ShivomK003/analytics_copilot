from typing import Literal, TypedDict

from langgraph.graph import END, START, StateGraph


class AgentState(TypedDict):
    question: str
    task_type: Literal["analytics", "research", "unknown"]
    response: str


def classify_task(state: AgentState) -> dict:
    question = state["question"].lower()

    if "how many" in question:
        return {"task_type": "analytics"}
    elif "paper" in question or "research" in question:
        return {"task_type": "research"}
    else:
        return {"task_type": "unknown"}


def process_analytics(state: AgentState) -> dict:
    question = state["question"]
    return {
        "response": f"Analytics response for: {question}"
    }

def process_research(state: AgentState) -> dict:
    question = state["question"]
    return {
        "response": f"Research response for: {question}"
    }

def process_unknown(state: AgentState) -> dict:
    return {
        "response": "Could you clarify whether you want research papers or analytics about the corpus?"
    }

builder = StateGraph(AgentState)

builder.add_node("classify_task", classify_task)

builder.add_node("process_analytics", process_analytics)
builder.add_node("process_research", process_research)
builder.add_node("process_unknown", process_unknown)

builder.add_edge(START, "classify_task")
builder.add_conditional_edges(
    "classify_task",
    lambda state: state["task_type"],
    {
        "analytics": "process_analytics",
        "research": "process_research",
        "unknown": "process_unknown"
    }
)

builder.add_edge("process_analytics", END)
builder.add_edge("process_research", END)
builder.add_edge("process_unknown", END)

graph = builder.compile()

## --------------------------------------------

questions = [
    "How many RAG papers were published?",
    "Find research papers about agents",
    "Tell me something interesting",
]

for question in questions: 
    initial_state = {
        "question": question,
        "task_type": "unknown",
        "response": ""
    }

    print("\n--- STATE UPDATES ---")
    for update in graph.stream(initial_state, stream_mode="updates"):
        print(update)

    print("\n--- FINAL STATE ---")
    result = graph.invoke(initial_state)
    print(result)