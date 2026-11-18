from typing import TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt


class AgentState(TypedDict):
    question: str
    research_plan: str
    approved: bool
    response: str


def prepare_research_plan(state: AgentState) -> dict:
    question = state["question"]
    research_plan = f"Research plan for: {question}"
    return {
        "research_plan": research_plan
    }

def request_approval(state: AgentState) -> dict:
    decision = interrupt({
        "question": state["question"],
        "research_plan": state["research_plan"],
        "message": "Do you approve this research plan? (Y/n)"
    })

    return {
        "approved": decision
    }


def execute_research(state: AgentState) -> dict:
    return {
        "response": "Research executed based on the approved plan"
    }


def reject_research(state: AgentState) -> dict:
    return {
        "response": "Research request rejected."
    }



builder = StateGraph(AgentState)

builder.add_node("prepare_research_plan", prepare_research_plan)
builder.add_node("request_approval", request_approval)
builder.add_node("execute_research", execute_research)
builder.add_node("reject_research", reject_research)

builder.add_edge(START, "prepare_research_plan")
builder.add_edge("prepare_research_plan", "request_approval")
builder.add_conditional_edges(
    "request_approval",
    lambda state: state["approved"],
    {
        True: "execute_research",
        False: "reject_research"
    }
)
builder.add_edge("execute_research", END)
builder.add_edge("reject_research", END)


graph = builder.compile(checkpointer=InMemorySaver())

config = {
    "configurable": {
        "thread_id": "research-session-001"
    }
}

initial_state = {
    "question": "Find recent papers on multi-agent systems",
    "research_plan": "",
    "approved": False,
    "response": ""
}


results = graph.invoke(initial_state, config=config)
print("Final Results:", results)



snapshot = graph.get_state(config)
print("Saved state:", snapshot.values)
print("Next nodes:", snapshot.next)




result = graph.invoke(
    Command(resume=False),
    config=config
)
print("After approval:", result)