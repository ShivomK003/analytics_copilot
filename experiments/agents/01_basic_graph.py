
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

print("SCRIPT STARTED")


class AgentState(TypedDict):
    question: str
    response: str


def process_question(state: AgentState) -> dict:
    question = state["question"]

    return {
        "response": f"You asked: {question}"
    }


builder = StateGraph(AgentState)

builder.add_node("process_question", process_question)

builder.add_edge(START, "process_question")
builder.add_edge("process_question", END)

graph = builder.compile()


initial_state = {
    "question": "What is retrieval-augmented generation?",
    "response": ""
}


print("/n --- STATE UPDATES ---")

for update in graph.stream(initial_state, stream_mode="values"):
    print(update)


print("/n --- FINAL STATE ---")
result = graph.invoke(initial_state)
print(result)