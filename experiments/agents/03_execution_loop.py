from typing import Literal, TypedDict

from langgraph.graph import END, START, StateGraph


class AgentState(TypedDict):
    question: str
    papers_found: int
    attempts: int
    sufficient: bool
    status: Literal["running", "success", "max_attempts_reached"]


builder = StateGraph(AgentState)

# -------
def retrieve_papers(state: AgentState) -> dict:
    state["attempts"] += 1
    state["papers_found"] += 2
    return {
        "attempts": state["attempts"],
        "papers_found": state["papers_found"],
    }


# -------
def evaluate_results(state: AgentState) -> dict:
    sufficient = state["papers_found"] >= 100

    if state["attempts"] >= 5 and not sufficient:
        status = "max_attempts_reached"
    elif sufficient:
        status = "success"
    else:
        status = "running"

    return {
        "sufficient": sufficient,
        "status": status
    }


# --------
def routing_after_evaluation(state: AgentState) -> dict:
    if state["sufficient"] or state["attempts"] >= 5:
        return "finish"
    else:
        return "retry"





builder.add_node("retrieve_papers", retrieve_papers)
builder.add_node("evaluate_results", evaluate_results)

builder.add_edge(START, "retrieve_papers")
builder.add_edge("retrieve_papers", "evaluate_results")
builder.add_conditional_edges(
    "evaluate_results",
    routing_after_evaluation,
    {
        "finish": END,
        "retry": "retrieve_papers"
    }
)

## ----- Run the experiment -----

initial_state = {
    "question": "Find papers about multi-agent systems",
    "papers_found": 0,
    "attempts": 0,
    "sufficient": False,
    "status": "running"
}

graph = builder.compile()

print("/n --- STATE UPDATES ---")
for update in graph.stream(initial_state, stream_mode="updates"):
    print(update)

print("/n --- FINAL STATE ---")
result = graph.invoke(initial_state)
print(result)